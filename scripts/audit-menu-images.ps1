param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$menuDataPath = Join-Path $RepositoryRoot 'data\cukcuk-menu.json'
$registryPath = Join-Path $RepositoryRoot 'assets\menu-images.js'
$imageDirectory = Join-Path $RepositoryRoot 'assets\menu'

$menuData = Get-Content -LiteralPath $menuDataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$registry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8

function Read-RegistrySet([string]$name) {
    $pattern = '{0}=new Set\(`([^`]*)`' -f [regex]::Escape($name)
    $match = [regex]::Match($registry, $pattern)
    if (-not $match.Success) {
        throw "Could not read $name from $registryPath"
    }

    return $match.Groups[1].Value.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
}

$mappedIds = @(
    Read-RegistrySet 'MENU_IMAGE_IDS'
    Read-RegistrySet 'MENU_QR_ADDED_IMAGE_IDS'
)
$jpgIds = @(
    Read-RegistrySet 'MENU_JPG_IDS'
    Read-RegistrySet 'MENU_GENERATED_JPG_IDS'
    Read-RegistrySet 'MENU_REFRESHED_JPG_IDS'
    Read-RegistrySet 'MENU_REFRAMED_JPG_IDS'
    Read-RegistrySet 'MENU_CROPPED_JPG_IDS'
    Read-RegistrySet 'MENU_QR_ADDED_JPG_IDS'
)
$forcePngIds = @(Read-RegistrySet 'MENU_FORCE_PNG_IDS')
$forceJpgIds = @(Read-RegistrySet 'MENU_FORCE_JPG_IDS')
$menuIds = @($menuData.menus | ForEach-Object id)

$missingMappings = @($menuData.menus | Where-Object { $mappedIds -notcontains $_.id })
$staleMappings = @($mappedIds | Where-Object { $menuIds -notcontains $_ })
$missingFiles = @()

foreach ($mappedId in $mappedIds) {
    $extension = if ($forcePngIds -contains $mappedId) {
        'png'
    } elseif (($forceJpgIds -contains $mappedId) -or ($jpgIds -contains $mappedId)) {
        'jpg'
    } else {
        'png'
    }
    $expectedPath = Join-Path $imageDirectory "$mappedId.$extension"
    if (-not (Test-Path -LiteralPath $expectedPath)) {
        $menu = $menuData.menus | Where-Object { $_.id -eq $mappedId } | Select-Object -First 1
        $missingFiles += [pscustomobject]@{
            Category = if ($menu) { $menu.categoryName } else { '(보관 이미지)' }
            Menu = if ($menu) { $menu.names.ko } else { '(현재 미노출)' }
            Id = $mappedId
            ExpectedPath = $expectedPath
        }
    }
}

$orphanFiles = @(
    Get-ChildItem -LiteralPath $imageDirectory -File |
        Where-Object { $mappedIds -notcontains $_.BaseName }
)

Write-Host "Menus: $($menuIds.Count)"
Write-Host "Mapped IDs: $($mappedIds.Count)"
Write-Host "Image files: $((Get-ChildItem -LiteralPath $imageDirectory -File).Count)"
Write-Host "Missing mappings: $($missingMappings.Count)"
Write-Host "Missing files: $($missingFiles.Count)"
Write-Host "Retained inactive mappings: $($staleMappings.Count)"
Write-Host "Orphan files: $($orphanFiles.Count)"

if ($missingMappings.Count) {
    $missingMappings |
        Select-Object @{Name='Category';Expression={$_.categoryName}}, @{Name='Menu';Expression={$_.names.ko}}, id |
        Format-Table -AutoSize
}

if ($missingFiles.Count) {
    $missingFiles | Format-Table Category, Menu, Id, ExpectedPath -AutoSize
}

if ($missingMappings.Count -or $missingFiles.Count -or $orphanFiles.Count) {
    exit 1
}

Write-Host 'Menu image audit passed.'
