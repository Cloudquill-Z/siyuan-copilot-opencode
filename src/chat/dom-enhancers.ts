import { tick } from 'svelte';
import { Constants } from 'siyuan';
import { openBlock, pushErrMsg, pushMsg } from '../api';

export function highlightCodeBlocks(element: HTMLElement) {
    if (!element) return;

    tick().then(async () => {
        try {
            if (!(window as any).hljs) {
                const loaded = await initHljs();
                if (!loaded) {
                    console.error('Failed to initialize highlight.js');
                    return;
                }
            }

            const hljs = (window as any).hljs;
            const codeBlocks = element.querySelectorAll(
                'pre > code:not([data-highlighted])'
            );
            codeBlocks.forEach((block: HTMLElement) => {
                if (block.querySelector('.hljs-keyword, .hljs-string, .hljs-comment')) {
                    return;
                }
                try {
                    const code = block.textContent || '';
                    const codeClass = block.className || '';
                    const match = codeClass.match(/(?:^|\s)language-([a-zA-Z0-9_-]+)/);
                    const language = match?.[1] || '';
                    let highlighted;
                    if (language && (!hljs.getLanguage || hljs.getLanguage(language))) {
                        highlighted = hljs.highlight(code, {
                            language,
                            ignoreIllegals: true,
                        });
                    } else {
                        highlighted = hljs.highlightAuto(code);
                    }
                    block.innerHTML = highlighted.value;
                    block.classList.add('hljs');
                    block.setAttribute('data-highlighted', 'true');
                    if (language) block.setAttribute('data-language', language);
                } catch (error) {
                    console.error('Highlight code block error:', error);
                }
            });
        } catch (error) {
            console.error('Highlight code blocks error:', error);
        }
    });
}

// 初始化 KaTeX
export const initKatex = async () => {
    if ((window as any).katex) return true;
    // https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/mathRender.ts
    const cdn = Constants.PROTYLE_CDN;
    addStyle(`${cdn}/js/katex/katex.min.css`, 'protyleKatexStyle');
    await addScript(`${cdn}/js/katex/katex.min.js`, 'protyleKatexScript');
    return (window as any).katex !== undefined && (window as any).katex !== null;
};

// 初始化 highlight.js
export const initHljs = async () => {
    if ((window as any).hljs) return;

    const setCodeTheme = (cdn = Constants.PROTYLE_CDN) => {
        const protyleHljsStyle = document.getElementById('protyleHljsStyle') as HTMLLinkElement;
        let css;
        if ((window as any).siyuan.config.appearance.mode === 0) {
            css = (window as any).siyuan.config.appearance.codeBlockThemeLight;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_LIGHT_CODE.includes(css)) {
                css = 'default';
            }
        } else {
            css = (window as any).siyuan.config.appearance.codeBlockThemeDark;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_DARK_CODE.includes(css)) {
                css = 'github-dark';
            }
        }
        const href = `${cdn}/js/highlight.js/styles/${css}.min.css`;
        if (!protyleHljsStyle) {
            addStyle(href, 'protyleHljsStyle');
        } else if (!protyleHljsStyle.href.includes(href)) {
            protyleHljsStyle.remove();
            addStyle(href, 'protyleHljsStyle');
        }
    };

    const cdn = Constants.PROTYLE_CDN;
    setCodeTheme(cdn);
    await addScript(`${cdn}/js/highlight.js/highlight.min.js`, 'protyleHljsScript');
    await addScript(`${cdn}/js/highlight.js/third-languages.js`, 'protyleHljsThirdScript');
    return (window as any).hljs !== undefined && (window as any).hljs !== null;
};

// 辅助：添加样式链接
const addStyle = (href: string, id: string) => {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
};

// https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/util/addScript.ts
export const addScript = (path: string, id: string) => {
    return new Promise(resolve => {
        if (document.getElementById(id)) {
            // 脚本加载后再次调用直接返回
            resolve(false);
            return false;
        }
        const scriptElement = document.createElement('script');
        scriptElement.src = path;
        scriptElement.async = true;
        // 循环调用时 Chrome 不会重复请求 js
        document.head.appendChild(scriptElement);
        scriptElement.onload = () => {
            if (document.getElementById(id)) {
                // 循环调用需清除 DOM 中的 script 标签
                scriptElement.remove();
                resolve(false);
                return false;
            }
            scriptElement.id = id;
            resolve(true);
        };
    });
};

// 渲染单个数学公式块
function renderMathBlock(element: HTMLElement) {
    try {
        const formula = element.textContent || '';
        if (!formula.trim()) {
            return;
        }

        const isBlock = element.tagName.toUpperCase() === 'DIV';

        // 使用 KaTeX 渲染公式
        const katex = (window as any).katex;
        const html = katex.renderToString(formula, {
            throwOnError: false, // 发生错误时不抛出异常
            displayMode: isBlock, // 使用显示模式（居中显示）
            strict: (errorCode: string) =>
                errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
            trust: true,
        });

        // 清空原始内容并插入渲染后的内容
        element.innerHTML = html;

        // 标记已渲染
        element.setAttribute('data-math-rendered', 'true');
    } catch (error) {
        console.error('Error rendering math formula:', error);
        element.innerHTML = `<span style="color: red;">公式渲染错误</span>`;
        element.setAttribute('data-math-rendered', 'true');
    }
}

// 渲染数学公式
export async function renderMathFormulas(element: HTMLElement) {
    if (!element) return;

    // 使用 tick 确保 DOM 已更新
    await tick();

    try {
        // 确保 KaTeX 已加载
        if (!(window as any).katex) {
            const loaded = await initKatex();
            if (!loaded) {
                console.error('Failed to initialize KaTeX');
                return;
            }
        }

        const katex = (window as any).katex;

        // 处理新格式的行内数学公式 span.language-math
        const inlineMathElements = element.querySelectorAll(
            'span.language-math:not([data-math-rendered])'
        );

        inlineMathElements.forEach((mathElement: HTMLElement) => {
            try {
                // 获取数学公式内容（从 textContent 获取）
                const mathContent = mathElement.textContent?.trim();
                if (mathContent) {
                    // 保存原始内容，用于复制时还原
                    if (!mathElement.hasAttribute('data-content')) {
                        mathElement.setAttribute('data-content', mathContent);
                    }

                    const html = katex.renderToString(mathContent, {
                        throwOnError: false,
                        displayMode: false,
                        strict: (errorCode: string) =>
                            errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                        trust: true,
                    });
                    mathElement.innerHTML = html;
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            } catch (error) {
                console.error('Render inline math error:', error, mathElement);
                mathElement.setAttribute('data-math-rendered', 'true');
            }
        });

        // 处理新格式的块级数学公式 div.language-math
        const blockMathElements = element.querySelectorAll(
            'div.language-math:not([data-math-rendered])'
        );

        blockMathElements.forEach((mathElement: HTMLElement) => {
            try {
                // 获取数学公式内容（从 textContent 获取）
                const mathContent = mathElement.textContent?.trim();
                if (mathContent) {
                    // 保存原始内容，用于复制时还原
                    if (!mathElement.hasAttribute('data-content')) {
                        mathElement.setAttribute('data-content', mathContent);
                    }

                    const html = katex.renderToString(mathContent, {
                        throwOnError: false,
                        displayMode: true,
                        strict: (errorCode: string) =>
                            errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                        trust: true,
                    });
                    mathElement.innerHTML = html;
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            } catch (error) {
                console.error('Render block math error:', error, mathElement);
                mathElement.setAttribute('data-math-rendered', 'true');
            }
        });

        // 兼容旧格式：处理 Lute 渲染的数学公式元素（带 data-subtype="math" 属性）
        const oldMathElements = element.querySelectorAll(
            '[data-subtype="math"]:not([data-math-rendered])'
        );

        oldMathElements.forEach((mathElement: HTMLElement) => {
            try {
                // 获取数学公式内容
                const mathContent = mathElement.getAttribute('data-content');
                if (!mathContent) {
                    return;
                }

                // 临时设置文本内容用于渲染
                mathElement.textContent = mathContent;

                // 渲染公式
                renderMathBlock(mathElement);
            } catch (error) {
                console.error('Render math formula error:', error, mathElement);
                // 即使渲染失败也标记，避免重复尝试
                mathElement.setAttribute('data-math-rendered', 'true');
            }
        });

        // 兼容旧格式：处理 span.katex
        const oldInlineMathElements = element.querySelectorAll(
            'span.katex:not([data-math-rendered])'
        );

        oldInlineMathElements.forEach((mathElement: HTMLElement) => {
            try {
                const mathContent = mathElement.getAttribute('data-content');
                if (mathContent) {
                    const html = katex.renderToString(mathContent, {
                        throwOnError: false,
                        displayMode: false,
                        strict: (errorCode: string) =>
                            errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                        trust: true,
                    });
                    mathElement.innerHTML = html;
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            } catch (error) {
                console.error('Render inline math error:', error, mathElement);
                mathElement.setAttribute('data-math-rendered', 'true');
            }
        });

        // 兼容旧格式：处理 div.katex
        const oldBlockMathElements = element.querySelectorAll(
            'div.katex:not([data-math-rendered])'
        );

        oldBlockMathElements.forEach((mathElement: HTMLElement) => {
            try {
                const mathContent = mathElement.getAttribute('data-content');
                if (mathContent) {
                    const html = katex.renderToString(mathContent, {
                        throwOnError: false,
                        displayMode: true,
                        strict: (errorCode: string) =>
                            errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                        trust: true,
                    });
                    mathElement.innerHTML = html;
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            } catch (error) {
                console.error('Render block math error:', error, mathElement);
                mathElement.setAttribute('data-math-rendered', 'true');
            }
        });
    } catch (error) {
        console.error('Render math formulas error:', error);
    }
}

// 清理代码块中不需要的元素并添加语言标签和复制按钮
export function cleanupCodeBlocks(element: HTMLElement) {
    if (!element) return;

    tick().then(() => {
        try {
            // 删除 .protyle-action__menu 元素
            const menuElements = element.querySelectorAll('.protyle-action__menu');
            menuElements.forEach((menu: HTMLElement) => {
                menu.remove();
            });

            // 删除 .protyle-action__copy 元素上的 b3-tooltips__nw 和 b3-tooltips 类
            const copyButtons = element.querySelectorAll('.protyle-action__copy');
            copyButtons.forEach((btn: HTMLElement) => {
                btn.classList.remove('b3-tooltips__nw', 'b3-tooltips');
            });

            // 为代码块添加语言标签和复制按钮
            const codeBlocks = element.querySelectorAll('pre > code');
            codeBlocks.forEach((codeElement: HTMLElement) => {
                const pre = codeElement.parentElement;
                if (!pre || pre.hasAttribute('data-lang-added')) return;

                // 尝试从 data-language 或 class 中提取语言名称
                let language = (codeElement.getAttribute('data-language') as string) || '';
                if (!language) {
                    const classes = codeElement.className.split(' ');
                    for (const cls of classes) {
                        if (cls.startsWith('language-')) {
                            language = cls.replace('language-', '');
                            break;
                        }
                    }
                }

                // 标记已处理
                pre.setAttribute('data-lang-added', 'true');

                // 创建工具栏容器
                const toolbar = document.createElement('div');
                toolbar.className = 'code-block-toolbar';

                // 创建语言标签
                const langLabel = document.createElement('div');
                langLabel.className = 'code-block-lang-label';
                langLabel.textContent = language;
                toolbar.appendChild(langLabel);

                // 创建复制按钮（放在工具栏右侧，即代码块右上角）
                const copyButton = document.createElement('button');
                copyButton.className = 'code-block-copy-btn';
                copyButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use xlink:href="#iconCopy"></use></svg>';
                copyButton.title = '复制代码';

                // 添加复制功能
                copyButton.addEventListener('click', () => {
                    const code = codeElement.textContent || '';
                    navigator.clipboard
                        .writeText(code)
                        .then(() => {
                            // 显示复制成功提示
                            pushMsg('已复制');
                            // 更新按钮图标
                            copyButton.innerHTML =
                                '<svg width="14" height="14" viewBox="0 0 24 24"><use xlink:href="#iconCheck"></use></svg>';
                            copyButton.classList.add('copied');
                            setTimeout(() => {
                                copyButton.innerHTML =
                                    '<svg width="14" height="14" viewBox="0 0 24 24"><use xlink:href="#iconCopy"></use></svg>';
                                copyButton.classList.remove('copied');
                            }, 2000);
                        })
                        .catch(err => {
                            console.error('Copy failed:', err);
                            pushErrMsg('复制失败');
                        });
                });

                // 组装工具栏：语言标签在左，复制按钮在右
                toolbar.appendChild(copyButton);

                // 设置 pre 为相对定位
                pre.style.position = 'relative';

                // 将工具栏插入到 pre 的开头
                pre.insertBefore(toolbar, pre.firstChild);
            });
        } catch (error) {
            console.error('Cleanup code blocks error:', error);
        }
    });
}

// 为思源块引用链接添加点击事件
export function setupBlockRefLinks(element: HTMLElement) {
    if (!element) return;

    tick().then(() => {
        try {
            // 查找所有思源块引用链接 a[href^="siyuan://blocks/"]
            const blockRefLinks = element.querySelectorAll('a[href^="siyuan://blocks/"]');

            blockRefLinks.forEach((link: HTMLElement) => {
                // 检查是否已经添加过监听器
                if (link.hasAttribute('data-block-ref-listener')) {
                    return;
                }

                // 标记已添加监听器
                link.setAttribute('data-block-ref-listener', 'true');
                link.style.cursor = 'pointer';

                // 添加点击事件监听器
                link.addEventListener('click', async (event: Event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const href = link.getAttribute('href');
                    if (!href) return;

                    // 提取块ID：siyuan://blocks/20251107164532-zmaydt9
                    const match = href.match(/siyuan:\/\/blocks\/(.+)/);
                    if (match && match[1]) {
                        const blockId = match[1];
                        try {
                            await openBlock(blockId);
                        } catch (error) {
                            console.error('Open block error:', error);
                            pushErrMsg(`打开块失败: ${(error as Error).message}`);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Setup block ref links error:', error);
        }
    });
}

// 为消息中的图片添加点击事件，调用图片查看器
export function setupImageClickHandlers(element: HTMLElement, openImageViewer: (src: string, name: string) => void) {
    if (!element) return;

    tick().then(() => {
        try {
            // 查找所有图片 img
            const images = element.querySelectorAll(
                '.ai-message__content img, .ai-message__thinking-content img'
            );

            images.forEach((img: HTMLImageElement) => {
                // 检查是否已经添加过监听器
                if (img.hasAttribute('data-image-viewer-listener')) {
                    return;
                }

                // 标记已添加监听器
                img.setAttribute('data-image-viewer-listener', 'true');
                img.style.cursor = 'zoom-in';

                // 添加点击事件监听器
                img.addEventListener('click', (event: Event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const src = img.getAttribute('src');
                    const alt = img.getAttribute('alt') || 'image';
                    if (src) {
                        openImageViewer(src, alt);
                    }
                });
            });
        } catch (error) {
            console.error('Setup image click handlers error:', error);
        }
    });
}

// 复制单条消息
