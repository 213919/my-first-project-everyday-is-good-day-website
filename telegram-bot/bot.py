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

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("📋 查看合約"), KeyboardButton("⚠️ 檢查到期")],
        [KeyboardButton("➕ 新增合約"), KeyboardButton("🗑️ 刪除合約")],
        [KeyboardButton("🗂️ 清除對話")],
    ],
    resize_keyboard=True,
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
# 合約到期前幾天算「快到期」
EXPIRY_WARN_DAYS = int(os.getenv("EXPIRY_WARN_DAYS", "30"))

CONTRACTS_FILE = Path(__file__).parent / "contracts.json"

ALLOWED_CHAT_IDS: set[int] = set()
if ALLOWED_CHAT_IDS_RAW.strip():
    for cid in ALLOWED_CHAT_IDS_RAW.split(","):
        cid = cid.strip()
        if cid:
            ALLOWED_CHAT_IDS.add(int(cid))

conversation_history: dict[int, list[dict]] = defaultdict(list)
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ConversationHandler states
ASK_NAME, ASK_COMPANY, ASK_DATE, ASK_NOTES = range(4)


# ── 合約資料存取 ──────────────────────────────────────────────

def load_contracts() -> list[dict]:
    if not CONTRACTS_FILE.exists():
        return []
    with open(CONTRACTS_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_contracts(contracts: list[dict]) -> None:
    with open(CONTRACTS_FILE, "w", encoding="utf-8") as f:
        json.dump(contracts, f, ensure_ascii=False, indent=2)


def get_expiring_contracts(within_days: int) -> list[dict]:
    contracts = load_contracts()
    today = datetime.date.today()
    deadline = today + datetime.timedelta(days=within_days)
    result = []
    for c in contracts:
        try:
            end = datetime.date.fromisoformat(c["contract_end_date"])
            if today <= end <= deadline:
                c["days_left"] = (end - today).days
                result.append(c)
        except (ValueError, KeyError):
            pass
    result.sort(key=lambda x: x["days_left"])
    return result


# ── 工具函式 ─────────────────────────────────────────────────

def is_authorized(chat_id: int) -> bool:
    if not ALLOWED_CHAT_IDS:
        return True
    return chat_id in ALLOWED_CHAT_IDS


async def send_long(update_or_bot, chat_id: int, text: str) -> None:
    """分段發送超過 4096 字的訊息"""
    if hasattr(update_or_bot, "message"):
        send = update_or_bot.message.reply_text
        for i in range(0, len(text), 4096):
            await send(text[i : i + 4096])
    else:
        for i in range(0, len(text), 4096):
            await update_or_bot.send_message(chat_id=chat_id, text=text[i : i + 4096])


# ── 一般指令 ──────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await update.message.reply_text(
        "您好！我是您的行政主管助理 Claude。\n\n"
        "直接輸入工作指令，或點選下方按鈕操作合約管理。",
        reply_markup=MAIN_KEYBOARD,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await update.message.reply_text(
        "使用說明\n\n"
        "直接輸入任何工作指令，Claude 會記住本次對話上下文。\n\n"
        "合約管理指令：\n"
        "/addcontract - 新增合約（姓名、公司、到期日）\n"
        "/listcontracts - 列出所有合約\n"
        "/checkcontracts - 立即檢查未來 30 天內到期的合約\n"
        "/removecontract - 刪除合約\n\n"
        "每週一早上 10:00 自動通知即將到期合約。\n\n"
        "其他指令：\n"
        "/clear - 清除對話記錄\n"
        "/id - 顯示您的 Chat ID"
    )


async def id_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    user = update.effective_user
    await update.message.reply_text(
        f"您的 Chat ID：{chat_id}\n使用者名稱：{user.full_name}"
    )


async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    conversation_history[update.effective_chat.id].clear()
    await update.message.reply_text("對話記錄已清除，可以開始新任務了。")


# ── 合約管理指令 ───────────────────────────────────────────────

async def list_contracts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    contracts = load_contracts()
    if not contracts:
        await update.message.reply_text("目前沒有任何合約記錄。\n使用 /addcontract 新增合約。")
        return
    today = datetime.date.today()
    lines = ["合約清單：\n"]
    for i, c in enumerate(contracts, 1):
        try:
            end = datetime.date.fromisoformat(c["contract_end_date"])
            days_left = (end - today).days
            if days_left < 0:
                status = f"已過期 {abs(days_left)} 天"
            elif days_left == 0:
                status = "今天到期！"
            elif days_left <= EXPIRY_WARN_DAYS:
                status = f"還有 {days_left} 天 ⚠️"
            else:
                status = f"還有 {days_left} 天"
        except (ValueError, KeyError):
            status = "日期格式錯誤"
        lines.append(
            f"{i}. {c.get('name', '—')}｜{c.get('company', '—')}\n"
            f"   到期：{c.get('contract_end_date', '—')}（{status}）\n"
            f"   備註：{c.get('notes', '無')}"
        )
    await update.message.reply_text("\n".join(lines))


async def check_contracts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    await _send_contract_report(context.bot, update.effective_chat.id)


async def remove_contract(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return
    contracts = load_contracts()
    if not contracts:
        await update.message.reply_text("目前沒有任何合約記錄。")
        return

    # 先列出清單讓用戶知道編號
    lines = ["請回傳要刪除的合約編號：\n"]
    for i, c in enumerate(contracts, 1):
        lines.append(f"{i}. {c.get('name', '—')}｜{c.get('company', '—')}｜{c.get('contract_end_date', '—')}")
    lines.append("\n直接回傳數字即可，例如：2")
    await update.message.reply_text("\n".join(lines))
    context.user_data["awaiting_remove"] = True


# ── 新增合約（ConversationHandler）────────────────────────────

async def addcontract_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return ConversationHandler.END
    context.user_data["new_contract"] = {}
    await update.message.reply_text("新增合約\n\n請輸入合約對象的姓名：")
    return ASK_NAME


async def got_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["new_contract"]["name"] = update.message.text.strip()
    await update.message.reply_text("請輸入公司名稱：")
    return ASK_COMPANY


async def got_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["new_contract"]["company"] = update.message.text.strip()
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
    context.user_data["new_contract"]["notes"] = "" if notes == "無" else notes
    contract = context.user_data.pop("new_contract")
    contracts = load_contracts()
    contracts.append(contract)
    save_contracts(contracts)
    await update.message.reply_text(
        f"合約已儲存！\n\n"
        f"姓名：{contract['name']}\n"
        f"公司：{contract['company']}\n"
        f"到期日：{contract['contract_end_date']}\n"
        f"備註：{contract.get('notes') or '無'}"
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("new_contract", None)
    await update.message.reply_text("已取消。")
    return ConversationHandler.END


# ── 定時通知邏輯 ──────────────────────────────────────────────

async def _send_contract_report(bot, chat_id: int) -> None:
    expiring = get_expiring_contracts(EXPIRY_WARN_DAYS)
    today = datetime.date.today()

    if not expiring:
        await bot.send_message(
            chat_id=chat_id,
            text=f"本週合約到期通知（{today}）\n\n未來 {EXPIRY_WARN_DAYS} 天內沒有即將到期的合約，請放心。"
        )
        return

    # 請 Claude 撰寫通知摘要
    contract_list = "\n".join(
        f"- {c['name']}（{c['company']}）：{c['contract_end_date']} 到期，還有 {c['days_left']} 天"
        + (f"，備註：{c['notes']}" if c.get("notes") else "")
        for c in expiring
    )
    prompt = (
        f"今天是 {today}（週一）。以下是未來 {EXPIRY_WARN_DAYS} 天內即將到期的合約清單：\n\n"
        f"{contract_list}\n\n"
        "請用繁體中文撰寫一份簡潔的週一早上合約到期提醒通知，"
        "列出每位當事人的情況，並建議我應優先處理哪些，格式清晰易讀。"
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
        message = f"本週合約到期提醒（{today}）\n\n" + contract_list

    await send_long(bot, chat_id, message)


async def weekly_contract_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    for chat_id in ALLOWED_CHAT_IDS:
        try:
            await _send_contract_report(context.bot, chat_id)
        except Exception as e:
            logger.error("Failed to send weekly report to %s: %s", chat_id, e)


# ── 一般訊息處理 ──────────────────────────────────────────────

BUTTON_MAP = {
    "📋 查看合約": list_contracts,
    "⚠️ 檢查到期": check_contracts,
    "🗑️ 刪除合約": remove_contract,
    "🗂️ 清除對話": clear_command,
}


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    # 按鈕觸發
    text = update.message.text or ""
    if text in BUTTON_MAP:
        result = await BUTTON_MAP[text](update, context)
        # addcontract_start 回傳 state，需要 ConversationHandler 接手，不中斷
        return

    # 處理刪除合約的號碼輸入
    if context.user_data.get("awaiting_remove"):
        text = update.message.text.strip()
        contracts = load_contracts()
        try:
            idx = int(text) - 1
            if 0 <= idx < len(contracts):
                removed = contracts.pop(idx)
                save_contracts(contracts)
                context.user_data.pop("awaiting_remove")
                await update.message.reply_text(
                    f"已刪除：{removed['name']}｜{removed['company']}｜{removed['contract_end_date']}"
                )
            else:
                await update.message.reply_text(f"編號無效，請輸入 1 到 {len(contracts)} 之間的數字。")
        except ValueError:
            await update.message.reply_text("請輸入數字編號。")
        return

    user_text = update.message.text
    if not user_text:
        return

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")
    conversation_history[chat_id].append({"role": "user", "content": user_text})
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
        await send_long(update, chat_id, assistant_reply)
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

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # 新增合約對話流程（支援指令與按鈕兩種入口）
    add_contract_handler = ConversationHandler(
        entry_points=[
            CommandHandler("addcontract", addcontract_start),
            MessageHandler(filters.Regex("^➕ 新增合約$"), addcontract_start),
        ],
        states={
            ASK_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_name)],
            ASK_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_company)],
            ASK_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_date)],
            ASK_NOTES: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_notes)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("clear", clear_command))
    app.add_handler(CommandHandler("id", id_command))
    app.add_handler(CommandHandler("listcontracts", list_contracts))
    app.add_handler(CommandHandler("checkcontracts", check_contracts))
    app.add_handler(CommandHandler("removecontract", remove_contract))
    app.add_handler(add_contract_handler)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # 每週一 10:00 定時通知（台灣時間 UTC+8）
    if ALLOWED_CHAT_IDS and app.job_queue:
        app.job_queue.run_daily(
            weekly_contract_job,
            time=datetime.time(hour=2, minute=0, tzinfo=datetime.timezone.utc),  # UTC 02:00 = 台灣 10:00
            days=(0,),  # 0 = 週一
            name="weekly_contract_check",
        )
        logger.info("每週一 10:00（台灣時間）合約到期通知已設定")

    logger.info("行政主管 Claude Bot 啟動中...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
