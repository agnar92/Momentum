#!/bin/bash
cd /home/user/Momentum/research
until grep -q gotowe wyniki/r68a_sec_extra.log || ! pgrep -f r68a_sec >/dev/null; do sleep 20; done
python3 r68_panel_finviz.py > wyniki/r68_panel.log 2>&1
python3 r69_finviz_analiza.py > wyniki/r69_finviz.log 2>&1
echo KONIEC >> wyniki/r69_finviz.log
