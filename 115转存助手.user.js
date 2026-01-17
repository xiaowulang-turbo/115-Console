// ==UserScript==
// @name         115转存助手 (115 Auto Save)
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  115网盘分享页面自动点击提交、一键转存及确认按钮，支持自动选择最近接收文件夹，支持自动登录
// @author       Xiaowu
// @match        https://115cdn.com/s/*
// @match        https://115.com/*
// @icon         https://115.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @license      MIT
// @updateURL    https://greasyfork.org/zh-CN/scripts/558227-115转存助手-115-auto-save/code
// @downloadURL  https://greasyfork.org/zh-CN/scripts/558227-115转存助手-115-auto-save/code
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置项 ==========
    const CONFIG = {
        // 等待元素的最长时间（毫秒）
        WAIT_TIMEOUT: 10000,
        // 操作之间的间隔（毫秒）
        ACTION_DELAY: 500,
        // 是否自动勾选"最近保存路径"复选框
        AUTO_CHECK_RECENT_PATH: true,
        // 是否自动关闭成功提示
        AUTO_CLOSE_SUCCESS: true,
        // 按钮文本匹配（支持多语言容错）
        BUTTON_TEXTS: {
            submit: ['确定', '提交', 'Submit', 'OK'],
            save: ['转存'],
            confirm: ['转存到此'],
            close: ['关闭', 'Close']
        }
    };

    // ========== 工具函数 ==========

    /**
     * 日志输出
     */
    const log = (message, type = 'info') => {
        const prefix = '[115转存助手]';
        const styles = {
            info: 'color: #3b82f6',
            success: 'color: #22c55e',
            warn: 'color: #f59e0b',
            error: 'color: #ef4444'
        };
        console.log(`%c${prefix} ${message}`, styles[type] || styles.info);
    };

    /**
     * 休眠指定毫秒数
     */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * 等待元素出现（使用 MutationObserver）
     */
    const waitForElement = (matchFn, timeout = CONFIG.WAIT_TIMEOUT) => {
        return new Promise((resolve, reject) => {
            // 立即检查一次
            const immediate = matchFn();
            if (immediate) {
                return resolve(immediate);
            }

            const observer = new MutationObserver(() => {
                const element = matchFn();
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 超时处理
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('等待元素超时'));
            }, timeout);
        });
    };

    /**
     * 通过文本内容查找按钮（支持多个候选文本）
     */
    const findButtonByTexts = (texts) => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const btnText = btn.textContent.trim();
            if (texts.some(t => btnText === t || btnText.includes(t))) {
                return btn;
            }
        }
        return null;
    };

    /**
     * 安全点击元素
     */
    const safeClick = async (element, desc) => {
        if (element) {
            log(`正在点击: ${desc}`);
            element.click();
            await sleep(CONFIG.ACTION_DELAY);
            return true;
        }
        log(`未找到元素: ${desc}`, 'warn');
        return false;
    };

    /**
     * 根据名称选择目标文件夹（如"最近接收"）
     */
    const selectTargetFolderByName = async (folderName) => {
        // 在所有可能的元素中查找文件夹名称
        const selectors = ['span', 'div', 'li', 'a', 'p'];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // 精确匹配文字且元素可见
                if (el.textContent.trim() === folderName && (el.offsetParent !== null || el.offsetWidth > 0)) {
                    log(`找到文件夹: ${folderName}，正在选择...`, 'success');
                    el.click();
                    await sleep(CONFIG.ACTION_DELAY);
                    return true;
                }
            }
        }
        return false;
    };

    /**
     * 查找并勾选"最近保存路径"复选框
     */
    const checkRecentPathCheckbox = () => {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            if (label.textContent.includes('最近保存路径')) {
                const checkbox = label.previousElementSibling;
                if (checkbox && checkbox.type === 'checkbox' && !checkbox.checked) {
                    checkbox.click();
                    log('已勾选"最近保存路径"复选框', 'success');
                    return true;
                } else if (checkbox && checkbox.checked) {
                    log('"最近保存路径"已勾选');
                    return true;
                }
            }
        }
        // 备用方案：直接查找复选框
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        for (const cb of checkboxes) {
            const nextEl = cb.nextElementSibling;
            if (nextEl && nextEl.textContent && nextEl.textContent.includes('最近保存路径')) {
                if (!cb.checked) {
                    cb.click();
                    log('已勾选"最近保存路径"复选框（备用方案）', 'success');
                }
                return true;
            }
        }
        return false;
    };

    /**
     * 关闭成功提示弹窗
     */
    const closeSuccessDialog = async () => {
        try {
            // 等待成功弹窗出现
            await waitForElement(() => {
                const dialogs = document.querySelectorAll('[data-dialog="true"], h3');
                for (const el of dialogs) {
                    if (el.textContent.includes('转存成功') || 
                        el.textContent.includes('成功')) {
                        return el;
                    }
                }
                return null;
            }, 5000);

            await sleep(300);

            // 查找关闭按钮
            const closeBtn = findButtonByTexts(CONFIG.BUTTON_TEXTS.close);
            if (closeBtn) {
                await safeClick(closeBtn, '关闭成功提示');
                log('转存流程完成！', 'success');
            }
        } catch (e) {
            log('未检测到成功提示弹窗', 'warn');
        }
    };

    // ========== 主执行逻辑 ==========

    const runScript = async () => {
        log('脚本启动...');

        try {
            // === 步骤 1: 点击"确定"按钮（提交访问码）===
            log('步骤 1/4: 等待确定按钮...');
            const submitBtn = await waitForElement(
                () => findButtonByTexts(CONFIG.BUTTON_TEXTS.submit)
            ).catch(() => null);
            
            if (submitBtn) {
                await safeClick(submitBtn, '确定按钮（提交访问码）');
            } else {
                log('未找到确定按钮，可能已提交访问码', 'warn');
            }

            // === 步骤 2: 点击"转存"按钮 ===
            log('步骤 2/4: 等待转存按钮...');
            await sleep(1000); // 等待页面加载
            
            const saveBtn = await waitForElement(
                () => findButtonByTexts(CONFIG.BUTTON_TEXTS.save)
            );
            await safeClick(saveBtn, '转存按钮');

            // === 步骤 3: 勾选复选框并点击"转存到此" ===
            log('步骤 3/4: 等待转存确认弹窗...');
            await sleep(800); // 等待弹窗动画
            
            // 优先选择"最近接收"文件夹
            const folderSelected = await selectTargetFolderByName('最近接收');
            
            // 如果没找到特定文件夹，退而求其次勾选"最近保存路径"复选框
            if (!folderSelected && CONFIG.AUTO_CHECK_RECENT_PATH) {
                await waitForElement(() => {
                    const labels = document.querySelectorAll('label');
                    for (const label of labels) {
                        if (label.textContent.includes('最近保存路径')) {
                            return label;
                        }
                    }
                    return null;
                }, 3000).catch(() => null);
                
                checkRecentPathCheckbox();
            }

            await sleep(500);

            // 点击"转存到此"按钮
            const confirmBtn = await waitForElement(
                () => findButtonByTexts(CONFIG.BUTTON_TEXTS.confirm)
            );
            await safeClick(confirmBtn, '转存到此确认按钮');

            // === 步骤 4: 关闭成功提示 ===
            if (CONFIG.AUTO_CLOSE_SUCCESS) {
                log('步骤 4/4: 等待关闭成功提示...');
                await closeSuccessDialog();
            }

            log('🎉 全部流程执行完毕！', 'success');

        } catch (error) {
            log(`执行出错: ${error.message}`, 'error');
            console.error(error);
        }
    };

    // ========== 登录页面处理 ==========
    
    /**
     * 检测是否在登录页面
     */
    const isLoginPage = () => {
        const url = window.location.href;
        // 115登录页特征：url包含115.com且有账密输入框或在特定的登录路径下
        return url.includes('115.com') && 
               (url.includes('goto=') || document.querySelector('input[name="account"]') || url.includes('/?mode=login'));
    };

    /**
     * 检测待处理的自动跳转
     */
    const checkPendingRedirect = () => {
        // 使用localStorage确保持久性
        const savedUrl = localStorage.getItem('115_auto_save_goto');
        if (savedUrl) {
            const currentUrl = window.location.href;
            // 如果已经在目标页面或在登录页，则不重复跳转
            if (currentUrl.includes(savedUrl) || isLoginPage()) {
                if (currentUrl.includes(savedUrl)) {
                    log('已到达目标页面，清除跳转标记');
                    localStorage.removeItem('115_auto_save_goto');
                }
                return false;
            }

            // 如果现在在115主页/网盘页，说明登录已完成但未正确跳转
            if (currentUrl.includes('115.com') && (currentUrl.includes('mode=wangpan') || currentUrl === 'https://115.com/')) {
                log(`检测到登录后未自动跳转，执行手动重定向: ${savedUrl.slice(0, 50)}...`, 'success');
                localStorage.removeItem('115_auto_save_goto');
                window.location.href = savedUrl;
                return true;
            }
        }
        return false;
    };

    /**
     * 通过文本查找链接元素
     */
    const findLinkByText = (texts) => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
            const linkText = link.textContent.trim();
            if (texts.some(t => linkText === t || linkText.includes(t))) {
                return link;
            }
        }
        return null;
    };

    /**
     * 处理短信验证弹窗
     * - 自动点击发送验证码
     * - 监测用户输入（最长60秒）
     * - 输入完成后自动点击确定
     */
    const handleSmsVerification = async () => {
        const SMS_TIMEOUT = 60000; // 60秒超时
        const CHECK_INTERVAL = 500; // 每500ms检查一次
        
        try {
            // 1. 点击发送验证码按钮（只点击可见的按钮）
            const sendCodeLinks = document.querySelectorAll('a');
            for (const link of sendCodeLinks) {
                const text = link.textContent.trim();
                if (text.includes('获取验证码') || text.includes('发送验证码')) {
                    // 检查元素是否可见（offsetParent 为 null 表示不可见）
                    if (link.offsetParent !== null || link.offsetWidth > 0) {
                        log('点击发送验证码: ' + text);
                        link.click();
                        break;
                    }
                }
            }
            
            await sleep(1000);
            log('⏳ 等待用户输入验证码（60秒超时）...');
            
            // 2. 监测验证码输入框
            const startTime = Date.now();
            let lastLogTime = 0;
            
            while (Date.now() - startTime < SMS_TIMEOUT) {
                // 查找所有输入框
                const allInputs = document.querySelectorAll('input');
                let smsCodeInput = null;
                
                for (const input of allInputs) {
                    const type = input.type;
                    const name = input.getAttribute('name') || '';
                    
                    // 跳过非文本输入框和账号/密码输入框
                    if (type !== 'text' && type !== 'tel' && type !== 'number') continue;
                    if (name === 'account' || name === 'passwd') continue;
                    
                    // 检查是否可见且有值
                    const isVisible = input.offsetParent !== null || input.offsetWidth > 0;
                    if (isVisible && input.value.length > 0) {
                        smsCodeInput = input;
                        break;
                    }
                }
                
                // 每5秒输出一次调试日志
                if (Date.now() - lastLogTime > 5000) {
                    log(`监测中... 找到输入框: ${smsCodeInput ? '是' : '否'}, 值长度: ${smsCodeInput?.value?.length || 0}`);
                    lastLogTime = Date.now();
                }
                
                if (smsCodeInput && smsCodeInput.value.length >= 4) {
                    log(`✅ 检测到验证码已输入: ${smsCodeInput.value.length}位`);
                    
                    // 3. 点击确定按钮
                    await sleep(300);
                    const allLinks = document.querySelectorAll('a');
                    for (const link of allLinks) {
                        const text = link.textContent.trim();
                        if (text === '确定' && (link.offsetParent !== null || link.offsetWidth > 0)) {
                            log('点击确定按钮提交验证码');
                            link.click();
                            log('验证码已提交，等待登录完成...', 'success');
                            
                            // 等待登录完成后跳转回原始页面（作为兜底）
                            await sleep(2000);
                            const savedUrl = localStorage.getItem('115_auto_save_goto');
                            if (savedUrl) {
                                log(`准备执行自动跳转: ${savedUrl.slice(0, 50)}...`);
                                localStorage.removeItem('115_auto_save_goto');
                                window.location.href = savedUrl;
                            }
                            return true;
                        }
                    }
                }
                
                await sleep(CHECK_INTERVAL);
            }
            
            log('⏰ 等待验证码超时（60秒），请手动完成登录', 'warn');
            return false;
            
        } catch (error) {
            log(`短信验证处理出错: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * 处理登录页面
     */
    const handleLoginPage = async () => {
        log('检测到登录页面，准备自动登录...');

        try {
            // 从URL中提取目标跳转地址
            const urlParams = new URLSearchParams(window.location.search);
            let gotoUrl = urlParams.get('goto');
            
            // 如果urlParams没拿到，尝试手动解析
            if (!gotoUrl && window.location.href.includes('goto=')) {
                gotoUrl = window.location.href.split('goto=')[1]?.split('&')[0];
            }

            if (gotoUrl) {
                const decodedUrl = decodeURIComponent(gotoUrl);
                // 保存到 localStorage，验证成功或到达主页后跳转
                localStorage.setItem('115_auto_save_goto', decodedUrl);
                log(`已标记重定向目标: ${decodedUrl.slice(0, 50)}...`);
            }

            // 等待页面加载
            await sleep(1000);

            // 检查是否需要切换到账号登录模式
            const accountLoginLink = findLinkByText(['使用账号登录']);
            if (accountLoginLink) {
                log('切换到账号登录模式');
                accountLoginLink.click();
                await sleep(800);
            }

            // 等待浏览器自动填充账号密码
            await sleep(1500);

            // 检查账号密码是否已填充
            const accountInput = document.querySelector('input[name="account"]');
            const passwdInput = document.querySelector('input[name="passwd"]');
            
            if (accountInput && passwdInput) {
                const hasAccount = accountInput.value.length > 0;
                const hasPasswd = passwdInput.value.length > 0;
                
                log(`账号: ${hasAccount ? '已填充' : '空'}, 密码: ${hasPasswd ? '已填充' : '空'}`);
                
                if (hasAccount && hasPasswd) {
                    // 查找并点击登录按钮 - 使用精确匹配
                    const allButtons = document.querySelectorAll('a.button');
                    let loginBtn = null;
                    for (const btn of allButtons) {
                        if (btn.textContent.trim() === '登录') {
                            loginBtn = btn;
                            break;
                        }
                    }
                    
                    if (loginBtn) {
                        await sleep(500);
                        log('点击登录按钮');
                        loginBtn.click();
                        
                        // 等待并检测短信验证弹窗
                        await sleep(2000);
                        // 遍历所有h3元素查找短信验证弹窗
                        const allH3 = document.querySelectorAll('h3');
                        let smsDialogFound = false;
                        for (const h3 of allH3) {
                            if (h3.textContent.includes('短信验证')) {
                                smsDialogFound = true;
                                break;
                            }
                        }
                        if (smsDialogFound) {
                            log('检测到短信验证弹窗，开始自动处理...');
                            await handleSmsVerification();
                        } else {
                            log('登录请求已发送，等待重定向...', 'success');
                            // 兜底跳转
                            await sleep(3000);
                            const savedUrl = localStorage.getItem('115_auto_save_goto');
                            if (savedUrl && !window.location.href.includes('115cdn.com')) {
                                window.location.href = savedUrl;
                            }
                        }
                    } else {
                        log('未找到登录按钮，可能已登录或在等待验证', 'warn');
                    }
                } else {
                    log('账号或密码未自动填充，请手动输入后点击登录', 'warn');
                }
            } else {
                // 尝试一键登录
                const allButtons = document.querySelectorAll('a.button');
                let quickLoginBtn = null;
                for (const btn of allButtons) {
                    const text = btn.textContent.trim();
                    if (text === '一键登录' || text === '快捷登录') {
                        quickLoginBtn = btn;
                        break;
                    }
                }
                if (quickLoginBtn) {
                    log('尝试一键登录');
                    quickLoginBtn.click();
                    log('一键登录已触发，等待重定向...', 'success');
                }
            }
        } catch (error) {
            log(`登录处理出错: ${error.message}`, 'error');
        }
    };

    // ========== 脚本入口 ==========
    
    const main = async () => {
        // 1. 首先检查是否有待处理的自动跳转（针对登录后降落在首页的情况）
        if (checkPendingRedirect()) {
            return;
        }

        const currentUrl = window.location.href;

        // 2. 判断当前页面类型并执行逻辑
        if (isLoginPage()) {
            // 登录页面
            handleLoginPage();
        } else if (currentUrl.includes('115cdn.com/s/')) {
            // 分享页面
            runScript();
        } else {
            // 在其他页面，只做跳转检测即可（已在第一步处理）
        }
    };

    if (document.readyState === 'complete') {
        main();
    } else {
        window.addEventListener('load', main);
    }

})();