@echo off
echo ==========================================
echo 🚀 Artist Agent: Pushing to GitHub
echo ==========================================
cd /d "c:\ArtistAgent"
git add .
git commit -m "Final synthesis and pipeline automation"
git push -u origin main
echo.
echo ✅ Done!
pause
