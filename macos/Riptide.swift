// Riptide for the Mac: a real app, with no browser. One native window (AppKit) showing the editor in Apple's own
// WebKit view; Riptide's server, which does the heavy work (exports, photoreal rendering on Metal), is started when
// the app opens and stopped when it quits, unless it was already running. Menus, Cmd+Q, full screen, the Dock, file
// pickers, downloads (exports land in Downloads) and dialogs all behave as in any Mac app.
//
// install.sh builds it with the compiler from Xcode's command line tools:
//   swiftc -O -o Riptide.app/Contents/MacOS/Riptide macos/Riptide.swift -framework Cocoa -framework WebKit
// and writes the path of the riptide command into Info.plist as RiptideLauncher.

import Cocoa
import WebKit

let address = URL(string: "http://127.0.0.1:5173/")!

// The editor's top bar is the window's title bar: the window's buttons sit at its left, and its empty space moves
// the window (double-click zooms it, as the Mac is set to). The page tells this view how tall the bar is and where
// its buttons and fields are; a click anywhere else in the bar drags the window.
final class RiptideWebView: WKWebView {
    var barHeight: CGFloat = 0
    var controls: [CGRect] = []

    override func mouseDown(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        let y = isFlipped ? p.y : bounds.height - p.y
        if y >= 0, y < barHeight, !controls.contains(where: { $0.insetBy(dx: -2, dy: -2).contains(CGPoint(x: p.x, y: y)) }) {
            if event.clickCount == 2 {
                let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
                if action == "Minimize" { window?.performMiniaturize(nil) } else if action != "None" { window?.zoom(nil) }
            } else {
                window?.performDrag(with: event)
            }
            return
        }
        super.mouseDown(with: event)
    }
}

// Run in every page of the app: marks it as the Mac app (room for the window's buttons), and reports the top bar.
let barScript = """
(() => {
  const mark = () => {
    const css = document.createElement('style');
    css.textContent = 'html.mac-app header#top{padding-left:84px}html.mac-app.mac-full header#top{padding-left:10px}';
    document.documentElement.classList.add('mac-app');
    (document.head || document.documentElement).appendChild(css);
  };
  if (document.documentElement) mark(); else document.addEventListener('DOMContentLoaded', mark);
  const send = () => {
    const bar = document.getElementById('top');
    if (!bar || !window.webkit?.messageHandlers?.riptideBar) return;
    const r = bar.getBoundingClientRect(), rects = [];
    for (const el of bar.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (el.matches('button,a,input,select,textarea,label,[contenteditable],[role=button],[tabindex]') || cs.cursor === 'pointer' || cs.cursor === 'text') {
        const b = el.getBoundingClientRect();
        if (b.width && b.height && cs.visibility !== 'hidden') rects.push([b.left, b.top, b.width, b.height]);
      }
    }
    window.webkit.messageHandlers.riptideBar.postMessage({ h: r.bottom, rects });
  };
  let queued = false;
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; send(); }); } };
  addEventListener('load', () => {
    send();
    const bar = document.getElementById('top');
    if (bar) new MutationObserver(soon).observe(bar, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener('resize', soon);
    document.fonts?.ready.then(soon);
  });
})();
"""

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate,
                         WKScriptMessageHandler, NSWindowDelegate {
    var windows: [NSWindow] = []
    var server: Process?
    var waited = 0
    var pending: URL?

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let web = openWindow(nil)
        web.loadHTMLString(Self.waitingPage, baseURL: nil)
        startServer()
        poll(web)
    }

    // riptide:// links, and Riptide's own addresses (a chat's window from Flash) opened with the app
    func application(_ app: NSApplication, open urls: [URL]) {
        for url in urls {
            var target = address
            if url.scheme == "http" || url.scheme == "https", url.host == "127.0.0.1" || url.host == "localhost" {
                target = url
            } else if url.scheme == "riptide", let q = url.query, !q.isEmpty {
                target = URL(string: address.absoluteString + "?" + q) ?? address
            }
            if let web = (windows.first { $0.isKeyWindow } ?? windows.first)?.contentView as? WKWebView, server != nil || waited > 0 {
                web.load(URLRequest(url: target))
            } else {
                pending = target
            }
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ note: Notification) {
        // the server is stopped only if this app started it
        server?.terminate()
    }

    // ----- the server -----
    func startServer() {
        if Self.answering() { return }
        let launcher = (Bundle.main.object(forInfoDictionaryKey: "RiptideLauncher") as? String) ?? "\(NSHomeDirectory())/.local/bin/riptide"
        let p = Process()
        p.executableURL = URL(fileURLWithPath: launcher)
        p.arguments = ["--serve"]
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        do { try p.run(); server = p } catch { NSLog("Riptide: could not start its server: \(error)") }
    }

    static func answering() -> Bool {
        var ok = false
        let done = DispatchSemaphore(value: 0)
        var req = URLRequest(url: address.appendingPathComponent("api/live/status"))
        req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            ok = (resp as? HTTPURLResponse)?.statusCode == 200
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 1.5)
        return ok
    }

    func poll(_ web: WKWebView) {
        DispatchQueue.global().async {
            let up = Self.answering()
            DispatchQueue.main.async {
                self.waited += 1
                if up {
                    web.load(URLRequest(url: self.pending ?? address))
                    self.pending = nil
                } else if self.waited > 120 {
                    web.loadHTMLString(Self.page("Riptide's server did not start. Run <code>riptide --serve</code> in Terminal to see why."), baseURL: nil)
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.poll(web) }
                }
            }
        }
    }

    // ----- windows -----
    @discardableResult
    func openWindow(_ config: WKWebViewConfiguration?) -> WKWebView {
        let cfg = config ?? WKWebViewConfiguration()
        let users = cfg.userContentController
        users.removeScriptMessageHandler(forName: "riptideBar")
        users.add(self, name: "riptideBar")
        if !users.userScripts.contains(where: { $0.source == barScript }) {
            users.addUserScript(WKUserScript(source: barScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let web = RiptideWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.customUserAgent = nil
        if #available(macOS 13.3, *) { web.isInspectable = true }
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                           styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                           backing: .buffered, defer: false)
        win.title = "Riptide"
        win.titleVisibility = .hidden            // the editor's own bar shows the name
        win.titlebarAppearsTransparent = true
        win.delegate = self
        win.appearance = NSAppearance(named: .darkAqua)
        win.backgroundColor = NSColor(calibratedRed: 0.07, green: 0.075, blue: 0.09, alpha: 1)
        win.contentView = web
        win.minSize = NSSize(width: 900, height: 600)
        win.collectionBehavior = [.fullScreenPrimary]
        win.isReleasedWhenClosed = false
        if windows.isEmpty { win.setFrameAutosaveName("RiptideMain") }
        if win.frame.origin == .zero { win.center() }
        win.makeKeyAndOrderFront(nil)
        windows.append(win)
        NSApp.activate(ignoringOtherApps: true)
        return web
    }

    // the page's top bar: how tall it is and where its controls are, so the rest of it moves the window
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "riptideBar", let web = message.webView as? RiptideWebView,
              let body = message.body as? [String: Any] else { return }
        web.barHeight = CGFloat((body["h"] as? NSNumber)?.doubleValue ?? 0)
        web.controls = (body["rects"] as? [[NSNumber]] ?? []).compactMap { r in
            r.count == 4 ? CGRect(x: r[0].doubleValue, y: r[1].doubleValue, width: r[2].doubleValue, height: r[3].doubleValue) : nil
        }
    }

    // in full screen the window's buttons are gone, and so is the room kept for them
    func windowDidEnterFullScreen(_ note: Notification) { fullScreen(note, true) }
    func windowDidExitFullScreen(_ note: Notification) { fullScreen(note, false) }
    func fullScreen(_ note: Notification, _ on: Bool) {
        let web = (note.object as? NSWindow)?.contentView as? WKWebView
        web?.evaluateJavaScript("document.documentElement.classList.toggle('mac-full', \(on))")
    }

    // a page asking for a new window (window.open, a link to a new tab): Riptide's own in a window of this app,
    // anything else in the Mac's browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if url.host == address.host && url.port == address.port { return openWindow(configuration) }
        NSWorkspace.shared.open(url)
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if #available(macOS 11.3, *), action.shouldPerformDownload { decisionHandler(.download); return }
        if let url = action.request.url, action.navigationType == .linkActivated,
           url.scheme == "http" || url.scheme == "https", url.host != address.host || url.port != address.port {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = ((response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? "")
            .lowercased().hasPrefix("attachment")
        if #available(macOS 11.3, *), attachment || !response.canShowMIMEType { decisionHandler(.download); return }
        decisionHandler(.allow)
    }

    // ----- downloads: an export goes to Downloads, under a name not already taken -----
    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    @available(macOS 11.3, *)
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Downloads")
        let name = suggestedFilename.isEmpty ? "Riptide export" : suggestedFilename
        let ext = (name as NSString).pathExtension, stem = (name as NSString).deletingPathExtension
        var dest = folder.appendingPathComponent(name)
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = folder.appendingPathComponent(ext.isEmpty ? "\(stem) \(n)" : "\(stem) \(n).\(ext)")
            n += 1
        }
        completionHandler(dest)
    }

    @available(macOS 11.3, *)
    func downloadDidFinish(_ download: WKDownload) {
        NSSound(named: "Glass")?.play()
    }

    // ----- what a page asks of the user: files to open, alerts, confirmations, prompts -----
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.runModal(); completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = prompt; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24)); field.stringValue = defaultText ?? ""
        a.accessoryView = field
        completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // ----- menus -----
    func buildMenu() {
        let main = NSMenu()
        func menu(_ title: String, _ items: [NSMenuItem]) {
            let holder = NSMenuItem(); let m = NSMenu(title: title)
            items.forEach { m.addItem($0) }; holder.submenu = m; main.addItem(holder)
        }
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; return i
        }
        menu("Riptide", [
            item("About Riptide", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
            .separator(),
            item("Hide Riptide", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:)), ""),
            .separator(),
            item("Quit Riptide", #selector(NSApplication.terminate(_:)), "q"),
        ])
        menu("File", [
            item("New Window", #selector(newWindow), "n", [.command, .shift]),
            item("Close Window", #selector(NSWindow.performClose(_:)), "w"),
        ])
        // the editor's own shortcuts (Cmd+Z, Cmd+C on layers) reach the page through these
        menu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        menu("View", [
            item("Reload", #selector(reload), "r"),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])
        // sessions: every project, swapped in this one window (the page does the work; see Sessions in app.js)
        menu("Sessions", [
            item("Show Sessions…", #selector(showSessions), "s", [.command, .option]),
            item("New Session", #selector(newSession), "n", [.command, .option]),
            .separator(),
            item("Next Session", #selector(nextSession), "]", [.command, .option]),
            item("Previous Session", #selector(previousSession), "[", [.command, .option]),
        ])
        let windowMenu = NSMenuItem(); let wm = NSMenu(title: "Window")
        wm.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        wm.addItem(item("Zoom", #selector(NSWindow.performZoom(_:)), ""))
        windowMenu.submenu = wm; main.addItem(windowMenu); NSApp.windowsMenu = wm
        NSApp.mainMenu = main
    }

    func inPage(_ js: String) {
        (NSApp.keyWindow?.contentView as? WKWebView)?.evaluateJavaScript("typeof Sessions !== 'undefined' && \(js)")
    }
    @objc func showSessions() { inPage("Sessions.open()") }
    @objc func newSession() { inPage("Sessions.fresh()") }
    @objc func nextSession() { inPage("Sessions.step(1)") }
    @objc func previousSession() { inPage("Sessions.step(-1)") }

    // a page that closes itself (a window handing its session to another) closes its window
    func webViewDidClose(_ webView: WKWebView) {
        webView.window?.close()
    }

    @objc func newWindow() {
        let web = openWindow(nil)
        web.load(URLRequest(url: address))
    }

    @objc func reload() {
        (NSApp.keyWindow?.contentView as? WKWebView)?.reload()
    }

    static func page(_ text: String) -> String {
        "<html><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#121317;color:#9aa0ab;"
            + "font:15px -apple-system,system-ui\"><div>\(text)</div></body></html>"
    }

    static let waitingPage = page("Starting Riptide…")
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
