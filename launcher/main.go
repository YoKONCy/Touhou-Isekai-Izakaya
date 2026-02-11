package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type BrowserLog struct {
	Level   string `json:"level"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
	URL     string `json:"url,omitempty"`
}

// 颜色定义 (ANSI Escape Codes)
const (
	ColorReset     = "\033[0m"
	ColorRed       = "\033[31m"
	ColorGreen     = "\033[32m"
	ColorYellow    = "\033[33m"
	ColorBlue      = "\033[34m"
	ColorPurple    = "\033[35m"
	ColorCyan      = "\033[36m"
	ColorWhite     = "\033[37m"
	ColorBold      = "\033[1m"
	ColorUnderline = "\033[4m"
	BgBlue         = "\033[44m"
)

const TaoBaoRegistry = "https://registry.npmmirror.com"

func main() {
	// 设置窗口标题 (仅 Windows)
	if runtime.GOOS == "windows" {
		exec.Command("cmd", "/c", "title Touhou Isekai Izakaya - Starter v1.0").Run()
	}

	clearTerminal()
	printBanner()

	// 启动日志接收服务 (异步)
	startLogServer()

	// 1. 检查 Node.js
	stepHeader(1, 5, "环境自检", "Environment Check")
	if !checkNode() {
		handleError("未找到 Node.js 运行环境",
			"请前往 https://nodejs.org/ 下载并安装（推荐 LTS 版本）。",
			"安装完成后，请重新打开此程序以刷新环境变量。")
		return
	}

	// 检查 pnpm
	if !checkPnpm() {
		fmt.Printf("\n  %s[!]%s 未找到 pnpm，正在通过镜像源自动安装...\n", ColorYellow, ColorReset)
		if err := runCommand("npm", "install", "-g", "pnpm", "--registry="+TaoBaoRegistry); err != nil {
			fmt.Printf("  %s[✕]%s pnpm 安装失败，将回退使用 npm。\n", ColorRed, ColorReset)
		} else {
			fmt.Printf("  %s[✓]%s pnpm 安装成功！\n", ColorGreen, ColorReset)
		}
	}

	pkgManager := "pnpm"
	if !checkPnpm() {
		pkgManager = "npm"
	}

	// 2. 自动切换镜像源
	stepHeader(2, 5, "网络优化", "Network Optimization")
	fmt.Printf("  正在接入加速节点: %s%s%s\n", ColorCyan, TaoBaoRegistry, ColorReset)

	// 清理旧版冗余配置（解决 npm 警告）
	runCommandSilent(pkgManager, "config", "delete", "npm_config_sharp_binary_host")
	runCommandSilent(pkgManager, "config", "delete", "npm_config_sharp_libvips_binary_host")

	if err := runCommand(pkgManager, "config", "set", "registry", TaoBaoRegistry); err != nil {
		fmt.Printf("  %s[✕]%s 配置失败，可能会影响下载速度。\n", ColorYellow, ColorReset)
	} else {
		fmt.Printf("  %s[✓]%s 网络环境已优化，下载速度已提升。\n", ColorGreen, ColorReset)
	}

	// 3. 检查并安装依赖
	stepHeader(3, 5, "组件装载", "Dependencies Loading")
	if _, err := os.Stat("node_modules"); os.IsNotExist(err) {
		fmt.Printf("  %s[!]%s 核心组件缺失，正在开始装载 (%s install)...\n", ColorYellow, ColorReset, pkgManager)
		if err := runCommand(pkgManager, "install"); err != nil {
			handleError("核心组件装载失败 ("+pkgManager+" install)",
				"1. 请检查您的互联网连接是否畅通。",
				"2. 尝试在终端运行 '"+pkgManager+" install' 获取原始报错信息。",
				"3. 某些时候删除 pnpm-lock.yaml 或 package-lock.json 会有奇效。")
			return
		}
		fmt.Printf("  %s[✓]%s 组件装载完成！\n", ColorGreen, ColorReset)
	} else {
		fmt.Printf("  %s[✓]%s 核心组件已就绪，跳过装载。\n", ColorGreen, ColorReset)
	}

	// 3.1 自动批准 pnpm 构建脚本 (针对 pnpm v10+)
	// 通过显式声明 onlyBuiltDependencies，pnpm 将不再提示授权
	if pkgManager == "pnpm" {
		fmt.Printf("  正在应用 pnpm 安全白名单配置...\n")
		// 确保 pnpm 识别 package.json 中的变更
		runCommandSilent(pkgManager, "install", "--prefer-offline")
	}

	// 4. 检查并构建项目
	stepHeader(4, 5, "资源编译", "Resource Compilation")
	needBuild := false
	if _, err := os.Stat("dist"); os.IsNotExist(err) {
		fmt.Printf("  %s[!]%s 资源文件未编译，准备开始完整编译...\n", ColorYellow, ColorReset)
		needBuild = true
	} else {
		fmt.Printf("  正在对比时空序列 (增量检查)...\n")
		latestSrc := getLatestModTime("src")
		distTime := getLatestModTime("dist")

		if latestSrc.After(distTime) {
			fmt.Printf("  %s[!]%s 观测到源代码变动 (%s%v%s)，触发重新编译...\n",
				ColorYellow, ColorReset, ColorCyan, latestSrc.Format("15:04:05"), ColorReset)
			needBuild = true
		} else {
			fmt.Printf("  %s[✓]%s 资源文件已是最新版本，跳过编译。\n", ColorGreen, ColorReset)
		}
	}

	if needBuild {
		if err := runCommand(pkgManager, "run", "build"); err != nil {
			handleError("资源编译任务中止",
				"1. 检查代码中是否存在未解决的 TypeScript 语法错误。",
				"2. 运行 '"+pkgManager+" run build' 查看具体的编译错误堆栈。",
				"3. 确认磁盘空间是否已满。")
			return
		}
		fmt.Printf("  %s[✓]%s 资源编译圆满完成！\n", ColorGreen, ColorReset)
	}

	// 5. 运行预览服务器
	stepHeader(5, 5, "次元传送", "Server Launching")
	fmt.Printf("  %s[信息]%s 正在建立次元连接通道...\n", ColorBlue, ColorReset)
	fmt.Printf("  %s[地址]%s 请在传送门开启后访问: %shttps://localhost:14791%s\n",
		ColorPurple, ColorReset, ColorUnderline+ColorCyan, ColorReset)
	fmt.Println("  ------------------------------------------------------------------")

	os.Setenv("NODE_TLS_REJECT_UNAUTHORIZED", "0")

	err := runCommand(pkgManager, "run", "preview")
	if err != nil {
		fmt.Printf("\n  %s[✕]%s 次元传送失败（可能是证书组件下载异常）。\n", ColorRed, ColorReset)
		fmt.Print("  是否尝试使用兼容模式 (HTTP) 再次传送? (y/n): ")

		reader := bufio.NewReader(os.Stdin)
		choice, _ := reader.ReadString('\n')
		choice = strings.TrimSpace(strings.ToLower(choice))

		if choice == "y" {
			fmt.Printf("\n  %s[!]%s 正在尝试兼容模式传送...\n", ColorCyan, ColorReset)
			os.Setenv("VITE_NO_HTTPS", "true")
			if err := runCommand(pkgManager, "run", "preview"); err != nil {
				handleError("次元传送最终失败",
					"1. 检查端口 14791 是否已被其他时空节点占用。",
					"2. 尝试手动运行 '"+pkgManager+" run preview' 寻找报错线索。")
				return
			}
		}
	}

	fmt.Printf("\n  %s[退出]%s 次元连接已断开。\n", ColorYellow, ColorReset)
	waitForExit()
}

func clearTerminal() {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("cmd", "/c", "cls")
		cmd.Stdout = os.Stdout
		cmd.Run()
	} else {
		fmt.Print("\033[H\033[2J")
	}
}

func stepHeader(current, total int, title, subtitle string) {
	barLen := 20
	filled := int(float64(current) / float64(total) * float64(barLen))
	bar := strings.Repeat("█", filled) + strings.Repeat("░", barLen-filled)

	fmt.Printf("\n%s %s %s %s %s %s\n",
		ColorBold+ColorBlue, bar, ColorReset,
		ColorBold+fmt.Sprintf("%d/%d", current, total),
		ColorBold+ColorWhite+title,
		ColorCyan+"("+subtitle+")"+ColorReset)
	fmt.Println(strings.Repeat("─", 60))
}

func handleError(title string, suggestions ...string) {
	fmt.Printf("\n%s%s┌──────────────────────────────────────────────────────┐%s\n", ColorRed, ColorBold, ColorReset)
	fmt.Printf("%s%s│ [故障中止] %-42s │%s\n", ColorRed, ColorBold, title, ColorReset)
	fmt.Printf("%s%s├──────────────────────────────────────────────────────┤%s\n", ColorRed, ColorBold, ColorReset)
	for _, s := range suggestions {
		fmt.Printf("%s%s│ • %-48s │%s\n", ColorYellow, ColorBold, s, ColorReset)
	}
	fmt.Printf("%s%s└──────────────────────────────────────────────────────┘%s\n", ColorRed, ColorBold, ColorReset)
	waitForExit()
}

func printBanner() {
	banner := `
%s    ___________              .__                 
    \__    ___/___  __ __  |  |__  ____  __ __ 
      |    | /  _ \|  |  \ |  |  \/  _ \|  |  \
      |    |(  <_> )  |  / |   Y  (  <_> )  |  /
      |____| \____/|____/  |___|  /\____/|____/ 
                                \/               
%s        >>> Touhou Isekai Izakaya Starter <<<
%s    ----------------------------------------------%s
`
	fmt.Printf(banner, ColorBold+ColorPurple, ColorBold+ColorGreen, ColorBlue, ColorReset)
}

func checkNode() bool {
	cmd := exec.Command("node", "-v")
	err := cmd.Run()
	if err == nil {
		out, _ := exec.Command("node", "-v").Output()
		fmt.Printf("  %s[环境]%s Node.js 版本: %s", ColorGreen, ColorReset, string(out))
		return true
	}
	return false
}

func checkPnpm() bool {
	cmd := exec.Command("pnpm", "-v")
	err := cmd.Run()
	return err == nil
}

func runCommand(name string, args ...string) error {
	if runtime.GOOS == "windows" {
		fullArgs := append([]string{"/c", name}, args...)
		cmd := exec.Command("cmd", fullArgs...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		return cmd.Run()
	}

	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

// 静默运行命令
func runCommandSilent(name string, args ...string) error {
	if runtime.GOOS == "windows" {
		fullArgs := append([]string{"/c", name}, args...)
		cmd := exec.Command("cmd", fullArgs...)
		return cmd.Run()
	}
	cmd := exec.Command(name, args...)
	return cmd.Run()
}

func getLatestModTime(dir string) time.Time {
	var latest time.Time
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			if info.ModTime().After(latest) {
				latest = info.ModTime()
			}
		}
		return nil
	})
	return latest
}

func waitForExit() {
	fmt.Printf("\n  %s按 [回车键] 归还控制权并退出...%s", ColorBold+ColorWhite, ColorReset)
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func startLogServer() {
	http.HandleFunc("/log", func(w http.ResponseWriter, r *http.Request) {
		// 允许跨域
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			return
		}

		var logData BrowserLog
		if err := json.NewDecoder(r.Body).Decode(&logData); err != nil {
			return
		}
		printBrowserLog(logData)
		w.WriteHeader(http.StatusOK)
	})

	go func() {
		// 尝试在 14792 端口启动
		http.ListenAndServe(":14792", nil)
	}()
}

func printBrowserLog(logData BrowserLog) {
	timeStr := time.Now().Format("15:04:05")
	prefix := fmt.Sprintf("%s[%s] [浏览器日志]%s ", ColorBold+ColorWhite, timeStr, ColorReset)

	levelColor := ColorWhite
	levelName := strings.ToUpper(logData.Level)

	switch logData.Level {
	case "error":
		levelColor = ColorRed
	case "warn":
		levelColor = ColorYellow
	case "info":
		levelColor = ColorBlue
	case "debug":
		levelColor = ColorCyan
	}

	fmt.Printf("\n%s%s[%s]%s %s\n", prefix, levelColor+ColorBold, levelName, ColorReset, logData.Message)

	if logData.URL != "" {
		fmt.Printf("  %s地址:%s %s\n", ColorCyan, ColorReset, logData.URL)
	}

	if logData.Stack != "" {
		lines := strings.Split(logData.Stack, "\n")
		fmt.Printf("  %s堆栈跟踪:%s\n", ColorRed+ColorUnderline, ColorReset)
		for _, line := range lines {
			if strings.TrimSpace(line) != "" {
				fmt.Printf("    %s%s%s\n", ColorWhite, line, ColorReset)
			}
		}
	}
	fmt.Println(strings.Repeat("─", 40))
}
