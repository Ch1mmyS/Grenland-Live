echo @echo off>> tools\update_all.cmd
echo setlocal>> tools\update_all.cmd
echo.>> tools\update_all.cmd
echo cd /d %%~dp0\..>> tools\update_all.cmd
echo.>> tools\update_all.cmd
echo py tools\fetch_official.py>> tools\update_all.cmd
echo.>> tools\update_all.cmd
echo echo.>> tools\update_all.cmd
echo echo Ferdig. Sjekk C:\grenland-live\data\>> tools\update_all.cmd
echo pause>> tools\update_all.cmd
@echo off
setlocal

cd /d %~dp0\..

py tools\fetch_official.py

echo.
echo Ferdig. Sjekk C:\grenland-live\data\
pause
