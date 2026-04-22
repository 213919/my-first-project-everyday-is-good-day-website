"""
行政主管 Claude - Telegram Bot
透過 Telegram 呼叫 Claude AI 執行工作命令，並定時通知合約到期情況
"""

import os
import json
import logging
import datetime
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
import anthropic
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Application,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ALLOWED_CHAT_IDS_RAW = os.getenv("ALLOWED_CHAT_IDS", "")
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "你是一位高效能的行政主管助理，負責協助處理各種工作任務。"
    "請用繁體中文回應，簡潔有力，直接提供可執行的建議與行動方案。"
    "你擅長：行程規劃、文件撰寫、資料整理、決策分析、任務追蹤。",
)
EXPIRY_WARN_DAYS = int(os.getenv("EXPIRY_WARN_DAYS", "30"))

# 資料根目錄：桌面的「克勞德」資料夾
BASE_DIR = Path.home() / "Desktop" / "克勞德"

# 兩個業務的合約資料夾
CATEGORIES = {
    "日日好日": BASE_DIR / "日日好日續約合約",
    "日青": BASE_DIR / "日青續約合約",
}

ALLOWED_CHAT_IDS: set[int] = set()
if ALLOWED_CHAT_IDS_RAW.strip():
    for _cid in ALLOWED_CHAT_IDS_RAW.split(","):
        _cid = _cid.strip()
        if _cid:
            ALLOWED_CHAT_IDS.add(int(_cid))

conversation_history: dict[int, list[dict]] = defaultdict(list)
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ConversationHandler states
ASK_CATEGORY, ASK_NAME, ASK_DATE, ASK_NOTES = range(4)

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("🏢 日日好日合約"), KeyboardButton("🌿 日青合約")],
        [KeyboardButton("➕ 新增合約"), KeyboardButton("🗑️ 刪除合約")],
        [KeyboardButton("⚠️ 檢查到期"), KeyboardButton("🗂️ 清除對話")],
    ],
    resize_keyboard=True,
)

CATEGORY_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("🏢 日日好日"), KeyboardButton("🌿 日青")],
        [KeyboardButton("❌ 取消")],
    ],
    resize_keyboard=True,
)


# ── 合約資料存取 ──────────────────────────────────────────────

def contracts_file(category: str) -> Path:
    return CATEGORIES[category] / "contracts.json"


def ensure_dirs() -> None:
    for folder in CATEGORIES.values():
        folder.mkdir(parents=True, exist_ok=True)


def load_contracts(category: str) -> list[dict]:
    f = contracts_file(category)
    if not f.exists():
        return []
    with open(f, encoding="utf-8") as fp:
        return json.load(fp)


def save_contracts(category: str, contracts: list[dict]) -> None:
    ensure_dirs()
    with open(contracts_file(category), "w", encoding="utf-8") as fp:
        json.dump(contracts, fp, ensure_ascii=False, indent=2)


def get_expiring_contracts(category: str, within_days: int) -> list[dict]:
    contracts = load_contracts(category)
    today = datetime.date.today()
    deadline = today + datetime.timedelta(days=within_days)
    result = []
    for c in contracts:
        try:
            end = datetime.date.fromisoformat(c["contract_end_date"])
            if today <= end <= deadline:
                result.append({**c, "days_left": (end - today).days})
        except (ValueError, KeyError):
            pass
    result.sort(key=lambda x: x["days_left"])
    return result


# ── 工具函式 ─────────────────────────────────────────────────

def is_authorized(chat_id: int) -> bool:
    if not ALLOWED_CHAT_IDS:
        return True
    return chat_id in ALLOWED_CHAT_IDS


def days_status(days_left: int) -> str:
    if days_left < 0:
        return f"已過期 {abs(days_left)} 天"
    if days_left == 0:
        return "今天到期！"
    if days_left <= EXPIRY_WARN_DAYS:
        return f"還有 {days_left} 天 ⚠️"
    return f"還有 {days_left} 天"


async def send_long(update_or_bot, chat_id: int, text: str, **kwargs) -> None:
    if hasattr(update_or_bot, "message"):
        for i in range(0, len(text), 4096):
            await update_or_bot.message.reply_text(text[i: i + 4096], **kwargs)
    else:
        for i in range(0, len(text), 4096):
            await update_or_bot.send_message(chat_id=chat_id, text=text[i: i + 4096], **kwargs)


def format_contracts_list(category: str) -> str:
    contracts = load_contracts(category)
    if not contracts:
        return f"【{category}】目前沒有任何合約記錄。"
    today = datetime.date.today()
    lines = [f"【{category}】合約清單（共 {len(contracts)} 筆）\n"]
    for i, c in enumerate(contracts, 1):
        try:
            end = datetime.date.fromisoformat(c["contract_end_date"])
            status = days_status((end - today).days)
        except (ValueError, KeyError):
            status = "日期格式錯誤"
        note = c.get("notes") or "無"
        lines.append(
            f"{i}. {c.get('name', '—')}\n"
            f"   到期：{c.get('contract_end_date', '—')}（{status}）\n"
            f"   備註：{note}"
        )
    return "\n".join(lines)


# ── 一般指令 ──────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    ensure_dirs()
    await update.message.reply_text(
        "您好！我是您的行政主管助理 Claude。\n\n"
        "直接輸入工作指令，或點選下方按鈕操作合約管理。\n"
        f"合約資料存放在：~/Desktop/克勞德/",
        reply_markup=MAIN_KEYBOARD,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await update.message.reply_text(
        "使用說明\n\n"
        "按鈕功能：\n"
        "🏢 日日好日合約 - 查看日日好日的合約清單\n"
        "🌿 日青合約 - 查看日青的合約清單\n"
        "➕ 新增合約 - 新增合約（會詢問是哪個業務）\n"
        "🗑️ 刪除合約 - 刪除合約\n"
        "⚠️ 檢查到期 - 立即檢查兩個業務的到期合約\n"
        "🗂️ 清除對話 - 清除 AI 對話記錄\n\n"
        "每週一早上 10:00 自動通知即將到期合約。\n\n"
        f"資料存放路徑：\n"
        f"~/Desktop/克勞德/日日好日續約合約/\n"
        f"~/Desktop/克勞德/日青續約合約/",
        reply_markup=MAIN_KEYBOARD,
    )


async def id_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    await update.message.reply_text(
        f"您的 Chat ID：{update.effective_chat.id}\n使用者名稱：{user.full_name}"
    )


async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    conversation_history[update.effective_chat.id].clear()
    await update.message.reply_text("對話記錄已清除，可以開始新任務了。", reply_markup=MAIN_KEYBOARD)


# ── 查看合約 ───────────────────────────────────────────────────

async def list_rihari(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await update.message.reply_text(format_contracts_list("日日好日"), reply_markup=MAIN_KEYBOARD)


async def list_nichinichi(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await update.message.reply_text(format_contracts_list("日青"), reply_markup=MAIN_KEYBOARD)


# ── 檢查到期 ──────────────────────────────────────────────────

async def check_contracts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await _send_contract_report(context.bot, update.effective_chat.id)


# ── 刪除合約 ──────────────────────────────────────────────────

async def remove_contract(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    all_contracts = []
    for cat in CATEGORIES:
        for c in load_contracts(cat):
            all_contracts.append({**c, "_category": cat})

    if not all_contracts:
        await update.message.reply_text("目前沒有任何合約記錄。", reply_markup=MAIN_KEYBOARD)
        return

    lines = ["請回傳要刪除的合約編號：\n"]
    for i, c in enumerate(all_contracts, 1):
        lines.append(
            f"{i}. [{c['_category']}] {c.get('name', '—')}｜{c.get('contract_end_date', '—')}"
        )
    lines.append("\n直接回傳數字即可，例如：2")
    await update.message.reply_text("\n".join(lines))
    context.user_data["awaiting_remove"] = True
    context.user_data["remove_pool"] = all_contracts


# ── 新增合約（ConversationHandler）────────────────────────────

async def addcontract_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return ConversationHandler.END
    context.user_data["new_contract"] = {}
    await update.message.reply_text(
        "新增合約\n\n請選擇要新增到哪個業務：",
        reply_markup=CATEGORY_KEYBOARD,
    )
    return ASK_CATEGORY


async def got_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ 取消":
        await update.message.reply_text("已取消。", reply_markup=MAIN_KEYBOARD)
        return ConversationHandler.END
    if "日日好日" in text:
        context.user_data["new_contract"]["_category"] = "日日好日"
    elif "日青" in text:
        context.user_data["new_contract"]["_category"] = "日青"
    else:
        await update.message.reply_text("請選擇「🏢 日日好日」或「🌿 日青」：", reply_markup=CATEGORY_KEYBOARD)
        return ASK_CATEGORY
    await update.message.reply_text("請輸入合約對象的姓名：")
    return ASK_NAME


async def got_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["new_contract"]["name"] = update.message.text.strip()
    await update.message.reply_text("請輸入合約到期日（格式：YYYY-MM-DD，例如 2026-12-31）：")
    return ASK_DATE


async def got_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = update.message.text.strip()
    try:
        datetime.date.fromisoformat(raw)
    except ValueError:
        await update.message.reply_text("日期格式不正確，請重新輸入（格式：YYYY-MM-DD）：")
        return ASK_DATE
    context.user_data["new_contract"]["contract_end_date"] = raw
    await update.message.reply_text("請輸入備註（可直接輸入「無」跳過）：")
    return ASK_NOTES


async def got_notes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    notes = update.message.text.strip()
    data = context.user_data.pop("new_contract")
    category = data.pop("_category")
    data["notes"] = "" if notes == "無" else notes

    contracts = load_contracts(category)
    contracts.append(data)
    save_contracts(category, contracts)

    await update.message.reply_text(
        f"合約已儲存到【{category}】！\n\n"
        f"姓名：{data['name']}\n"
        f"到期日：{data['contract_end_date']}\n"
        f"備註：{data.get('notes') or '無'}\n\n"
        f"檔案位置：~/Desktop/克勞德/{category}續約合約/contracts.json",
        reply_markup=MAIN_KEYBOARD,
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("new_contract", None)
    await update.message.reply_text("已取消。", reply_markup=MAIN_KEYBOARD)
    return ConversationHandler.END


# ── 定時通知邏輯 ──────────────────────────────────────────────

async def _send_contract_report(bot, chat_id: int) -> None:
    today = datetime.date.today()
    all_expiring = {}
    for cat in CATEGORIES:
        expiring = get_expiring_contracts(cat, EXPIRY_WARN_DAYS)
        if expiring:
            all_expiring[cat] = expiring

    if not all_expiring:
        await bot.send_message(
            chat_id=chat_id,
            text=f"合約到期通知（{today}）\n\n兩個業務未來 {EXPIRY_WARN_DAYS} 天內都沒有即將到期的合約，請放心。"
        )
        return

    contract_summary = []
    for cat, items in all_expiring.items():
        for c in items:
            contract_summary.append(
                f"- [{cat}] {c['name']}：{c['contract_end_date']} 到期，還有 {c['days_left']} 天"
                + (f"，備註：{c['notes']}" if c.get("notes") else "")
            )

    prompt = (
        f"今天是 {today}（週一）。以下是未來 {EXPIRY_WARN_DAYS} 天內即將到期的合約清單：\n\n"
        + "\n".join(contract_summary)
        + "\n\n請用繁體中文撰寫一份簡潔的週一早上合約到期提醒通知，"
        "分成日日好日和日青兩個區塊，列出每位當事人的情況，並建議應優先處理哪些。"
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        message = response.content[0].text
    except Exception as e:
        logger.error("Claude API error in scheduled job: %s", e)
        message = f"合約到期提醒（{today}）\n\n" + "\n".join(contract_summary)

    await send_long(bot, chat_id, message)


async def weekly_contract_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    for chat_id in ALLOWED_CHAT_IDS:
        try:
            await _send_contract_report(context.bot, chat_id)
        except Exception as e:
            logger.error("Failed to send weekly report to %s: %s", chat_id, e)


# ── 一般訊息處理 ──────────────────────────────────────────────

BUTTON_MAP = {
    "🏢 日日好日合約": list_rihari,
    "🌿 日青合約": list_nichinichi,
    "⚠️ 檢查到期": check_contracts,
    "🗑️ 刪除合約": remove_contract,
    "🗂️ 清除對話": clear_command,
}


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    text = update.message.text or ""

    # 按鈕觸發
    if text in BUTTON_MAP:
        await BUTTON_MAP[text](update, context)
        return

    # 刪除合約的號碼輸入
    if context.user_data.get("awaiting_remove"):
        pool = context.user_data.get("remove_pool", [])
        try:
            idx = int(text.strip()) - 1
            if 0 <= idx < len(pool):
                target = pool[idx]
                cat = target["_category"]
                contracts = load_contracts(cat)
                # 以姓名+日期比對找到並移除
                contracts = [
                    c for c in contracts
                    if not (c.get("name") == target.get("name") and
                            c.get("contract_end_date") == target.get("contract_end_date"))
                ]
                save_contracts(cat, contracts)
                context.user_data.pop("awaiting_remove", None)
                context.user_data.pop("remove_pool", None)
                await update.message.reply_text(
                    f"已刪除：[{cat}] {target.get('name', '—')}｜{target.get('contract_end_date', '—')}",
                    reply_markup=MAIN_KEYBOARD,
                )
            else:
                await update.message.reply_text(f"編號無效，請輸入 1 到 {len(pool)} 之間的數字。")
        except ValueError:
            await update.message.reply_text("請輸入數字編號。")
        return

    if not text:
        return

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")
    conversation_history[chat_id].append({"role": "user", "content": text})
    history = conversation_history[chat_id][-40:]

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=history,
        )
        assistant_reply = response.content[0].text
        conversation_history[chat_id].append({"role": "assistant", "content": assistant_reply})
        await send_long(update, chat_id, assistant_reply, reply_markup=MAIN_KEYBOARD)
    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        await update.message.reply_text(f"Claude API 發生錯誤：{e}")
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        await update.message.reply_text("發生未預期的錯誤，請稍後再試。")


# ── 主程式 ────────────────────────────────────────────────────

def main() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("請在 .env 設定 TELEGRAM_BOT_TOKEN")
    if not ANTHROPIC_API_KEY:
        raise ValueError("請在 .env 設定 ANTHROPIC_API_KEY")

    ensure_dirs()

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    add_contract_handler = ConversationHandler(
        entry_points=[
            CommandHandler("addcontract", addcontract_start),
            MessageHandler(filters.Regex("^➕ 新增合約$"), addcontract_start),
        ],
        states={
            ASK_CATEGORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_category)],
            ASK_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_name)],
            ASK_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_date)],
            ASK_NOTES: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_notes)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("clear", clear_command))
    app.add_handler(CommandHandler("id", id_command))
    app.add_handler(CommandHandler("checkcontracts", check_contracts))
    app.add_handler(add_contract_handler)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    if ALLOWED_CHAT_IDS and app.job_queue:
        app.job_queue.run_daily(
            weekly_contract_job,
            time=datetime.time(hour=2, minute=0, tzinfo=datetime.timezone.utc),
            days=(0,),
            name="weekly_contract_check",
        )
        logger.info("每週一 10:00（台灣時間）合約到期通知已設定")

    logger.info("行政主管 Claude Bot 啟動中...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
