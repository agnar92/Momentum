# CEM10 na komputerze (Windows PowerShell 5.1, bez instalowania niczego).
# Pobiera: sklad S&P 500 i Nasdaq-100 (Wikipedia), sito Finviz (2 skany: S&P 500 i Nasdaq-100 z 6M > +20 %), sklad WIG20 / mWIG40 (sklad_gpw.json),
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
function Clean-Cell($c) {
    $t = [regex]::Replace($c, '(?s)<[^>]+>', '')
    $t = [Net.WebUtility]::HtmlDecode($t)
    return ([regex]::Replace($t, '\[[^\]]*\]', '')).Trim()
}
# tabela skladu z Wikipedii -> slownik ticker -> nazwa (pierwsza tabela "wikitable" z kolumna tickera i nazwy, >= 90 wierszy)
function Get-WikiMembers($url, $tickerCols, $nameCols) {
    $html = (Invoke-WebRequest -Uri $url -Headers $UA -UseBasicParsing -TimeoutSec 60).Content
    foreach ($tb in [regex]::Matches($html, '(?s)<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>(.*?)</table>')) {
        $rows = [regex]::Matches($tb.Groups[1].Value, '(?s)<tr[^>]*>(.*?)</tr>')
        if ($rows.Count -lt 90) { continue }
        $head = @([regex]::Matches($rows[0].Groups[1].Value, '(?s)<t[hd][^>]*>(.*?)</t[hd]>') | ForEach-Object { Clean-Cell $_.Groups[1].Value })
        $ti = -1; foreach ($x in $tickerCols) { if ($ti -lt 0) { $ti = [array]::IndexOf($head, $x) } }
        $ni = -1; foreach ($x in $nameCols) { if ($ni -lt 0) { $ni = [array]::IndexOf($head, $x) } }
        if ($ti -lt 0 -or $ni -lt 0) { continue }
        $out = [ordered]@{}
        for ($i = 1; $i -lt $rows.Count; $i++) {
            $cells = @([regex]::Matches($rows[$i].Groups[1].Value, '(?s)<t[hd][^>]*>(.*?)</t[hd]>') | ForEach-Object { Clean-Cell $_.Groups[1].Value })
            if ($cells.Count -gt [Math]::Max($ti, $ni) -and $cells[$ti]) { $out[$cells[$ti].Replace('.', '-')] = $cells[$ni] }
        }
        return $out
    }
    throw "brak tabeli skladu: $url"
}

$today = [DateTime]::Now.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
Write-Host "CEM10 - lista na podstawie zamknietych miesiecy ($today)" -ForegroundColor Cyan

# 1. sklad USA (Wikipedia, przy bledzie zapisany sklad_usa.json)
$usaFile = Join-Path $Dir 'sklad_usa.json'
$membersSrc = 'wikipedia'
try {
    $sp = Get-WikiMembers 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies' @('Symbol') @('Security')
    $nq = Get-WikiMembers 'https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies' @('Ticker', 'Symbol') @('Company', 'Security')
    if ($sp.Count -lt 400 -or $nq.Count -lt 90) { throw "za malo spolek (S&P $($sp.Count), NDX $($nq.Count))" }
    $membersJson = (@{ sp = $sp; nq = $nq } | ConvertTo-Json -Depth 4 -Compress)
    Write-Utf8 $usaFile $membersJson
    Write-Host "Sklad: S&P 500 $($sp.Count), Nasdaq-100 $($nq.Count) (Wikipedia)"
} catch {
    if (-not (Test-Path $usaFile)) { throw "Nie udalo sie pobrac skladu z Wikipedii ($($_.Exception.Message)) i nie ma pliku sklad_usa.json." }
    Write-Host "Wikipedia niedostepna ($($_.Exception.Message)) - uzywam zapisanego sklad_usa.json" -ForegroundColor Yellow
    $membersJson = Read-Utf8 $usaFile
    $membersSrc = 'plik'
}
$mem = $membersJson | ConvertFrom-Json
$gpwJson = Read-Utf8 (Join-Path $Dir 'sklad_gpw.json')
$gpw = $gpwJson | ConvertFrom-Json

# 2. sito Finviz (2 zapytania, widok "Tickers"): S&P 500 i Nasdaq-100 ze zwrotem z pol roku > +20 % (zapas do progu 6M > +30 %)
function Get-FinvizTickers($filters) {
    $html = (Invoke-WebRequest -Uri "https://finviz.com/screener.ashx?v=411&f=$filters" -Headers $UA -UseBasicParsing -TimeoutSec 60).Content
    return @([regex]::Matches($html, 'data-ticker="([A-Z0-9.\-]+)"') | ForEach-Object { $_.Groups[1].Value.Replace('.', '-') } | Sort-Object -Unique)
}
$allUsa = @($mem.sp.PSObject.Properties.Name) + @($mem.nq.PSObject.Properties.Name) | Sort-Object -Unique
$prefilter = $null
try {
    $fsp = Get-FinvizTickers 'idx_sp500,ta_perf_26w20o'
    Start-Sleep -Milliseconds 800
    $fnq = Get-FinvizTickers 'idx_ndx,ta_perf_26w20o'
    if ($fsp.Count -lt 10) { throw "podejrzanie malo spolek ($($fsp.Count))" }
    $prefilter = @{ sp = $fsp.Count; nq = $fnq.Count }
    $usa = @($fsp) + @($fnq) | Where-Object { $mem.sp.PSObject.Properties.Name -contains $_ -or $mem.nq.PSObject.Properties.Name -contains $_ } | Sort-Object -Unique
    Write-Host "Sito Finviz (6M > +20 %): S&P 500 $($fsp.Count), Nasdaq-100 $($fnq.Count)"
} catch {
    Write-Host "Finviz niedostepny ($($_.Exception.Message)) - pobieram wszystkie spolki S&P 500 i Nasdaq-100" -ForegroundColor Yellow
    $usa = $allUsa
}

# 3. Twoje spolki: najnowszy plik zapisany ze strony (cem10_moje_spolki_*.txt albo moje_spolki.txt) w tym folderze
$held = @()
$hf = Get-ChildItem -Path $Dir -Filter '*moje_spolki*.txt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($hf) {
    $held = @([regex]::Matches((Read-Utf8 $hf.FullName).ToUpper(), '[A-Z0-9][A-Z0-9.\-]*') | ForEach-Object { $_.Value.Replace('.', '-') } | Sort-Object -Unique)
    Write-Host "Twoje spolki z pliku $($hf.Name): $($held -join ', ')"
}
$heldUsa = @($held | Where-Object { $allUsa -contains $_ })
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
$pf = if ($prefilter) { '{"sp":' + $prefilter.sp + ',"nq":' + $prefilter.nq + ',"filtr":"6M > +20 %"}' } else { 'null' }
$req = '[' + ((@($usa) | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
$raw = '{"today":"' + $today + '","members_src":"' + $membersSrc + '","prefilter":' + $pf + ',"requested":' + $req + ',"members":' + $membersJson + ',"gpw":' + $gpwJson + ',"px":{' + ($parts -join ',') + '}}'
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
