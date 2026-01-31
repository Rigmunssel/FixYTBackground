@echo off
echo Building Backstage Play extension...
if exist backstage-play.xpi del backstage-play.xpi
powershell Compress-Archive -Path manifest.json,scripts,icons,LICENSE -DestinationPath backstage-play.zip -Force
ren backstage-play.zip backstage-play.xpi
echo Done: backstage-play.xpi
pause
