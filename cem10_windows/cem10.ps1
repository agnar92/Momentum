# CEM10 na komputerze (Windows PowerShell 5.1, bez instalowania niczego).
# Pobiera: najpierw lidera (SPY / QQQ z Yahoo), potem sito Finviz (1 skan: indeks lidera z 6M > +30 % = regula), sklad WIG20 / mWIG40 (sklad_gpw.json),
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

# 2. LIDER (SPY albo QQQ z wyzszym zwrotem 5M na zamknieciach miesiecy; ta sama regula co w cem10.js) - najpierw on, potem sito tylko dla jego indeksu
function Get-Yahoo($s) {
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/$([Uri]::EscapeDataString($s))?range=2y&interval=1mo&includeAdjustedClose=true"
    for ($try = 1; $try -le 3; $try++) {
        try {
            $body = (Invoke-WebRequest -Uri $url -Headers $UA -UseBasicParsing -TimeoutSec 30).Content
            if ($body -match '"timestamp"') { return $body }
            Start-Sleep -Milliseconds 500
        } catch { Start-Sleep -Seconds $try }
    }
    return $null
}
$upto = [DateTime]::Now.AddDays(1 - [DateTime]::Now.Day).AddMonths(-1).ToString('yyyy-MM', [Globalization.CultureInfo]::InvariantCulture)   # ostatni zamkniety miesiac
# 5M na zamknieciach skorygowanych: ostatnia wartosc miesiaca <= $upto (swieca miesieczna zaczyna sie o polnocy czasu gieldy, +2 h zapasu jak w monthMap)
function Get-Ret5($json) {
    $r = ($json | ConvertFrom-Json).chart.result[0]
    $off = [int]$r.meta.gmtoffset
    $adj = @($r.indicators.adjclose[0].adjclose)
    $byMonth = [ordered]@{}
    for ($i = 0; $i -lt $r.timestamp.Count; $i++) {
        if ($null -eq $adj[$i]) { continue }
        $ym = [DateTimeOffset]::FromUnixTimeSeconds([long]$r.timestamp[$i] + $off + 7200).UtcDateTime.ToString('yyyy-MM', [Globalization.CultureInfo]::InvariantCulture)
        if ($ym -le $upto) { $byMonth[$ym] = [double]$adj[$i] }
    }
    $v = @($byMonth.Values); $k = $v.Count
    if ($k -lt 6 -or @($byMonth.Keys)[$k - 1] -ne $upto) { throw "brak zamknietego miesiaca $upto w danych" }
    return $v[$k - 1] / $v[$k - 6] - 1
}
$spyJson = Get-Yahoo 'SPY'; $qqqJson = Get-Yahoo 'QQQ'
if (-not $spyJson -or -not $qqqJson) { throw "Nie udalo sie pobrac SPY / QQQ z Yahoo - sprobuj ponownie za chwile." }
$s5 = Get-Ret5 $spyJson; $q5 = Get-Ret5 $qqqJson
$lead = if ($q5 -gt $s5) { 'NDX' } else { 'SP' }
Write-Host ("Lider: {0} (SPY 5M {1:P1}, QQQ 5M {2:P1})" -f $lead, $s5, $q5)

# 3. sito Finviz TYLKO dla indeksu lidera (widok "Tickers"): zwrot z pol roku > +30 % (to jest regula; skan daje tez przynaleznosc do indeksu)
# Finviz niedostepny = blad (bez zapasowego zrodla skladu). Nazwy spolek bierze strona z odpowiedzi Yahoo.
function Get-FinvizTickers($filters) {
    $html = (Invoke-WebRequest -Uri "https://finviz.com/screener.ashx?v=411&f=$filters" -Headers $UA -UseBasicParsing -TimeoutSec 60).Content
    return @([regex]::Matches($html, 'data-ticker="([A-Z0-9.\-]+)"') | ForEach-Object { $_.Groups[1].Value.Replace('.', '-') } | Sort-Object -Unique)
}
$fl = if ($lead -eq 'NDX') { 'idx_ndx,ta_perf_26w30o' } else { 'idx_sp500,ta_perf_26w30o' }
try { $fin = Get-FinvizTickers $fl } catch { throw "Finviz niedostepny ($($_.Exception.Message)) - sprobuj ponownie za chwile." }
if ($fin.Count -gt $(if ($lead -eq 'NDX') { 80 } else { 300 })) { throw "Finviz: podejrzana liczba spolek ($($fin.Count)) - filtr nie dziala." }
$fo = [ordered]@{}; foreach ($t in $fin) { $fo[$t] = $t }
$empty = [ordered]@{}
$prefilter = @{ lead = $lead; sp = $(if ($lead -eq 'SP') { $fin.Count } else { 0 }); nq = $(if ($lead -eq 'NDX') { $fin.Count } else { 0 }) }
$membersJson = (@{ sp = $(if ($lead -eq 'SP') { $fo } else { $empty }); nq = $(if ($lead -eq 'NDX') { $fo } else { $empty }) } | ConvertTo-Json -Depth 4 -Compress)
$usa = @($fin)
Write-Host "Sito Finviz (6M > +30 %, tylko indeks lidera): $($fin.Count) spolek"

# 4. Twoje spolki: najnowszy plik zapisany ze strony (cem10_moje_spolki_*.txt albo moje_spolki.txt) w tym folderze
$held = @()
$hf = Get-ChildItem -Path $Dir -Filter '*moje_spolki*.txt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($hf) {
    $held = @([regex]::Matches((Read-Utf8 $hf.FullName).ToUpper(), '[A-Z0-9][A-Z0-9.\-]*') | ForEach-Object { $_.Value.Replace('.', '-') } | Sort-Object -Unique)
    Write-Host "Twoje spolki z pliku $($hf.Name): $($held -join ', ')"
}
$gpwNames = @($gpw.WIG20.PSObject.Properties.Name) + @($gpw.mWIG40.PSObject.Properties.Name)
$heldUsa = @($held | Where-Object { $gpwNames -notcontains $_ -and $_ -notmatch '-WA$' })
$usa = @($usa) + $heldUsa | Sort-Object -Unique

# lista symboli Yahoo: USA po sicie + Twoje, cala GPW (Finviz nie obejmuje GPW); SPY i QQQ sa juz pobrane (lider)
$syms = New-Object System.Collections.Generic.List[string]
foreach ($t in ($usa | Where-Object { $_ -ne 'SPY' -and $_ -ne 'QQQ' })) { $syms.Add($t) }
$gp = @($gpw.WIG20.PSObject.Properties.Name) + @($gpw.mWIG40.PSObject.Properties.Name) | Sort-Object -Unique
foreach ($t in $gp) { $syms.Add("$t.WA") }

# 5. miesieczne swiece z Yahoo (odpowiedzi zapisywane bez zmian, liczy je strona)
$parts = New-Object System.Collections.Generic.List[string]
$parts.Add('"SPY":' + $spyJson); $parts.Add('"QQQ":' + $qqqJson)
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
if (($parts.Count - 2) -lt 0.9 * $syms.Count) { throw "Za malo cen ($($parts.Count - 2) z $($syms.Count)) - sprobuj ponownie za chwile." }

# 6. dane.js + strona
$pf = '{"lead":"' + $lead + '","sp":' + $prefilter.sp + ',"nq":' + $prefilter.nq + ',"filtr":"6M > +30 %"}'
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
