// ==UserScript==
// @name         115转存助手 (115 Auto Save)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  115网盘分享页面自动点击提交、一键转存及确认按钮，支持自动选择最近接收文件夹
// @author       Xiaowu
// @match        https://115cdn.com/s/*
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
            
            // 勾选"最近保存路径"复选框
            if (CONFIG.AUTO_CHECK_RECENT_PATH) {
                await waitForElement(() => {
                    const labels = document.querySelectorAll('label');
                    for (const label of labels) {
                        if (label.textContent.includes('最近保存路径')) {
                            return label;
                        }
                    }
                    return null;
                }, 5000).catch(() => null);
                
                checkRecentPathCheckbox();
            }

            await sleep(300);

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

    // ========== 脚本入口 ==========
    if (document.readyState === 'complete') {
        runScript();
    } else {
        window.addEventListener('load', runScript);
    }

})();