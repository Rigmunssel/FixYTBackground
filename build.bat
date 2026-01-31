@echo off
echo Building Backstage Play extension...
if exist backstage-play.xpi del backstage-play.xpi
powershell -ExecutionPolicy Bypass -File build.ps1
if exist backstage-play.xpi (
    echo Done: backstage-play.xpi
) else (
    echo Build failed!
)
pause
