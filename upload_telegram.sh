#!/bin/bash
set -e

# Usage: ./upload_telegram.sh <FILE_PATH> <BOT_TOKEN> <CHAT_ID> [CAPTION]

FILE_PATH="$1"
BOT_TOKEN="$2"
CHAT_ID="$3"
CAPTION="${4:-}"

if [ -z "$FILE_PATH" ] || [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
    echo "Usage: $0 <FILE_PATH> <BOT_TOKEN> <CHAT_ID> [CAPTION]"
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File '$FILE_PATH' does not exist!"
    exit 1
fi

# Get absolute path to avoid curl relative path issues
ABS_PATH=$(realpath "$FILE_PATH")

echo "Uploading: $ABS_PATH"
echo "File size: $(du -h "$ABS_PATH" | cut -f1)"

# Upload using curl with robust quoting
# -F document=@"..." tells curl to treat it as a file upload
curl -v -F "document=@$ABS_PATH" \
     -F "chat_id=$CHAT_ID" \
     -F "caption=$CAPTION" \
     "https://api.telegram.org/bot$BOT_TOKEN/sendDocument"

echo -e "\nUpload finished."
