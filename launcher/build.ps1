# 编译 Touhou Isekai Izakaya 启动器脚本

Write-Host ">>> 正在编译启动器..." -ForegroundColor Cyan

# 确保在脚本所在目录执行
Set-Location $PSScriptRoot

try {
    # 执行 Go 编译，输出到项目根目录
    Write-Host ">>> 正在生成 一键启动.exe..." -ForegroundColor Cyan
    $env:GOOS = "windows"
    # 清理缓存并构建
    go clean -cache
    go build -o ../一键启动.exe main.go

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[✓] 编译成功！" -ForegroundColor Green
        Write-Host "可执行文件已更新: ../一键启动.exe" -ForegroundColor White
    } else {
        Write-Host "`n[✕] 编译失败，请检查 Go 环境或代码错误。" -ForegroundColor Red
    }
}
finally {
    # 保持在原位
}

Write-Host "`n按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
