"""
行政主管 Claude - Telegram Bot
透過 Telegram 呼叫 Claude AI 執行工作命令
"""

import os
import logging
from collections import defaultdict
from dotenv import load_dotenv
import anthropic
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
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

ALLOWED_CHAT_IDS: set[int] = set()
if ALLOWED_CHAT_IDS_RAW.strip():
    for cid in ALLOWED_CHAT_IDS_RAW.split(","):
        cid = cid.strip()
        if cid:
            ALLOWED_CHAT_IDS.add(int(cid))

# 每個 chat 的對話記錄（記憶體內）
conversation_history: dict[int, list[dict]] = defaultdict(list)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def is_authorized(chat_id: int) -> bool:
    if not ALLOWED_CHAT_IDS:
        return True  # 未設定白名單時允許所有人（開發階段）
    return chat_id in ALLOWED_CHAT_IDS


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    await update.message.reply_text(
        "👋 您好！我是您的行政主管助理 Claude。\n\n"
        "您可以直接傳送任何工作指令給我，例如：\n"
        "• 幫我草擬一封客戶回覆信\n"
        "• 整理這份會議紀錄的重點\n"
        "• 幫我規劃本週工作優先順序\n\n"
        "指令：\n"
        "/clear - 清除對話記錄，開始新任務\n"
        "/help - 顯示使用說明\n"
        "/id - 顯示您的 Chat ID"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    await update.message.reply_text(
        "📋 使用說明\n\n"
        "直接輸入任何工作指令，Claude 會記住本次對話的上下文。\n\n"
        "可用指令：\n"
        "/start - 歡迎訊息\n"
        "/clear - 清除對話記錄\n"
        "/help - 顯示此說明\n"
        "/id - 顯示您的 Chat ID（用於設定白名單）"
    )


async def id_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    user = update.effective_user
    await update.message.reply_text(
        f"您的 Chat ID：`{chat_id}`\n"
        f"使用者名稱：{user.full_name}",
        parse_mode="Markdown",
    )


async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    conversation_history[chat_id].clear()
    await update.message.reply_text("對話記錄已清除，可以開始新任務了。")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not is_authorized(chat_id):
        await update.message.reply_text("抱歉，您沒有使用此機器人的權限。")
        return

    user_text = update.message.text
    if not user_text:
        return

    # 顯示「正在思考」狀態
    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    # 加入用戶訊息到對話記錄
    conversation_history[chat_id].append({"role": "user", "content": user_text})

    # 保留最近 20 輪對話以控制 token 用量
    history = conversation_history[chat_id][-40:]

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=history,
        )

        assistant_reply = response.content[0].text

        # 將助理回應加入記錄
        conversation_history[chat_id].append(
            {"role": "assistant", "content": assistant_reply}
        )

        # Telegram 訊息上限 4096 字，超過則分段發送
        if len(assistant_reply) <= 4096:
            await update.message.reply_text(assistant_reply)
        else:
            for i in range(0, len(assistant_reply), 4096):
                await update.message.reply_text(assistant_reply[i : i + 4096])

    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        await update.message.reply_text(f"Claude API 發生錯誤：{e}")
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        await update.message.reply_text("發生未預期的錯誤，請稍後再試。")


def main() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("請在 .env 設定 TELEGRAM_BOT_TOKEN")
    if not ANTHROPIC_API_KEY:
        raise ValueError("請在 .env 設定 ANTHROPIC_API_KEY")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("clear", clear_command))
    app.add_handler(CommandHandler("id", id_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("行政主管 Claude Bot 啟動中...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
