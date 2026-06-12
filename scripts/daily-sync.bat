#!/bin/bash
# Novel Reader Daily Git Sync Script
# Run at 2:00 AM daily

cd "G:\SoftwareDev\novel-reader"

# Set git identity (required for cron jobs)
git config --local user.email "erik2468tw@github.com"
git config --local user.name "erik2468tw"

# Add all changes
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "No changes to commit"
else
    # Commit with timestamp
    DATE=$(date "+%Y-%m-%d %H:%M")
    git commit -m "Auto-sync: $DATE"
    
    # Push to GitHub
    git push origin main
    
    echo "Synced at $DATE"
fi