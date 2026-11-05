# CEM10 na komputerze (Windows PowerShell 5.1, bez instalowania niczego).
# Pobiera: sito Finviz (2 skany: S&P 500 i Nasdaq-100 z 6M > +30 % = regula; skad tez wiadomo, ktora spolka jest w ktorym indeksie), sklad WIG20 / mWIG40 (sklad_gpw.json),
# Twoje spolki z zapisanego pliku, miesieczne swiece z Yahoo Finance (2 lata) tylko dla tych spolek.
# Zapisuje surowe dane do dane.js, tworzy CEM10_lista.html (szablon.html z paczki albo ..\docs\cem10.html z repo) i otwiera ja w przegladarce.
# Cale liczenie listy robi strona (docs/js/cem10.js, computeFromRaw) - ten sam wynik co cem10.py w GitHub Actions.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # pasek postepu Invoke-WebRequest bardzo spowalnia PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Split-Path -Parent $Dir
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CEM10' }
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Read-Utf8($path) { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
function Write-Utf8($path, $text) { [IO.File]::WriteAllText($path, $text, $Utf8) }
$today = [DateTime]::Now.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
Write-Host "CEM10 - lista na podstawie zamknietych miesiecy ($today)" -ForegroundColor Cyan

# 1. sklad GPW (reczny plik sklad_gpw.json)
$gpwJson = Read-Utf8 (Join-Path $Dir 'sklad_gpw.json')
$gpw = $gpwJson | ConvertFrom-Json

# 2. sito Finviz (2 zapytania, widok "Tickers"): S&P 500 i Nasdaq-100 ze zwrotem z pol roku > +30 % (to jest regula; skan daje tez przynaleznosc do indeksu)
# Finviz niedostepny = blad (bez zapasowego zrodla skladu). Nazwy spolek bierze strona z odpowiedzi Yahoo.
function Get-FinvizTickers($filters) {
    $html = (Invoke-WebRequest -Uri "https://finviz.com/screener.ashx?v=411&f=$filters" -Headers $UA -UseBasicParsing -TimeoutSec 60).Content
    return @([regex]::Matches($html, 'data-ticker="([A-Z0-9.\-]+)"') | ForEach-Object { $_.Groups[1].Value.Replace('.', '-') } | Sort-Object -Unique)
}
try {
    $fsp = Get-FinvizTickers 'idx_sp500,ta_perf_26w30o'
    Start-Sleep -Milliseconds 800
    $fnq = Get-FinvizTickers 'idx_ndx,ta_perf_26w30o'
} catch { throw "Finviz niedostepny ($($_.Exception.Message)) - sprobuj ponownie za chwile." }
if ($fsp.Count -lt 5 -or $fsp.Count -gt 300 -or $fnq.Count -gt 80) { throw "Finviz: podejrzana liczba spolek (S&P $($fsp.Count), NDX $($fnq.Count)) - zmieniony uklad albo filtr nie dziala." }
$prefilter = @{ sp = $fsp.Count; nq = $fnq.Count }
$spo = [ordered]@{}; foreach ($t in $fsp) { $spo[$t] = $t }
$nqo = [ordered]@{}; foreach ($t in $fnq) { $nqo[$t] = $t }
$membersJson = (@{ sp = $spo; nq = $nqo } | ConvertTo-Json -Depth 4 -Compress)
$usa = @($fsp) + @($fnq) | Sort-Object -Unique
Write-Host "Sito Finviz (6M > +30 %): S&P 500 $($fsp.Count), Nasdaq-100 $($fnq.Count)"

# 3. Twoje spolki: najnowszy plik zapisany ze strony (cem10_moje_spolki_*.txt albo moje_spolki.txt) w tym folderze
$held = @()
$hf = Get-ChildItem -Path $Dir -Filter '*moje_spolki*.txt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($hf) {
    $held = @([regex]::Matches((Read-Utf8 $hf.FullName).ToUpper(), '[A-Z0-9][A-Z0-9.\-]*') | ForEach-Object { $_.Value.Replace('.', '-') } | Sort-Object -Unique)
    Write-Host "Twoje spolki z pliku $($hf.Name): $($held -join ', ')"
}
$gpwNames = @($gpw.WIG20.PSObject.Properties.Name) + @($gpw.mWIG40.PSObject.Properties.Name)
$heldUsa = @($held | Where-Object { $gpwNames -notcontains $_ -and $_ -notmatch '-WA$' })
$usa = @($usa) + $heldUsa | Sort-Object -Unique

# lista symboli Yahoo: SPY, QQQ, USA po sicie + Twoje, cala GPW (Finviz nie obejmuje GPW)
$syms = New-Object System.Collections.Generic.List[string]
$syms.Add('SPY'); $syms.Add('QQQ')
foreach ($t in $usa) { $syms.Add($t) }
$gp = @($gpw.WIG20.PSObject.Properties.Name) + @($gpw.mWIG40.PSObject.Properties.Name) | Sort-Object -Unique
foreach ($t in $gp) { $syms.Add("$t.WA") }

# 4. miesieczne swiece z Yahoo (odpowiedzi zapisywane bez zmian, liczy je strona)
$parts = New-Object System.Collections.Generic.List[string]
$bad = New-Object System.Collections.Generic.List[string]
$n = 0
foreach ($s in $syms) {
    $n++
    if ($n % 50 -eq 0 -or $n -eq $syms.Count) { Write-Host "Ceny z Yahoo: $n z $($syms.Count)" }
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/$([Uri]::EscapeDataString($s))?range=2y&interval=1mo&includeAdjustedClose=true"
    $ok = $false
    for ($try = 1; $try -le 3 -and -not $ok; $try++) {
        try {
            $body = (Invoke-WebRequest -Uri $url -Headers $UA -UseBasicParsing -TimeoutSec 30).Content
            if ($body -match '"timestamp"') { $parts.Add(('"' + $s + '":' + $body)); $ok = $true }
            else { Start-Sleep -Milliseconds 500 }
        } catch { Start-Sleep -Seconds $try }
    }
    if (-not $ok) { $bad.Add($s) }
}
Write-Host "Ceny: $($syms.Count - $bad.Count) z $($syms.Count)" $(if ($bad.Count) { "(brak: $($bad -join ', '))" } else { '' })
if ($parts.Count -lt 0.9 * $syms.Count) { throw "Za malo cen ($($parts.Count) z $($syms.Count)) - sprobuj ponownie za chwile." }

# 5. dane.js + strona
$pf = '{"sp":' + $prefilter.sp + ',"nq":' + $prefilter.nq + ',"filtr":"6M > +30 %"}'
$req = '[' + ((@($usa) | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
$raw = '{"today":"' + $today + '","prefilter":' + $pf + ',"requested":' + $req + ',"members":' + $membersJson + ',"gpw":' + $gpwJson + ',"px":{' + ($parts -join ',') + '}}'
Write-Utf8 (Join-Path $Dir 'dane.js') ("window.CEM10_RAW = " + $raw + ";`n")
# szablon strony: paczka (szablon.html + cem10.js w tym folderze) albo repozytorium (..\docs\cem10.html + ..\docs\js\cem10.js)
if (Test-Path (Join-Path $Dir 'szablon.html')) {
    $page = (Read-Utf8 (Join-Path $Dir 'szablon.html')).Replace('<script src="js/cem10.js"></script>', '<script src="dane.js"></script><script src="cem10.js"></script>')
} else {
    $page = (Read-Utf8 (Join-Path $Repo 'docs\cem10.html')).Replace('<script src="js/cem10.js"></script>', '<script src="dane.js"></script><script src="../docs/js/cem10.js"></script>')
}
$out = Join-Path $Dir 'CEM10_lista.html'
Write-Utf8 $out $page
Write-Host "Gotowe: $out" -ForegroundColor Green
Start-Process $out
