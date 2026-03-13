@echo off
echo ==========================================
echo 🎨 Artist Agent: Running Content Assembler
echo ==========================================
cd /d "c:\ArtistAgent\scheduler"
node scripts/agent-content-assembler.js
pause
