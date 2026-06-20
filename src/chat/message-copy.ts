import type { MessageContent } from '../ai-chat';
import { pushErrMsg, pushMsg } from '../api';
import { getMessageText } from './message-content';
import { t } from '../utils/i18n';

export function copyMessage(content: string | MessageContent[]) {
    const textContent = typeof content === 'string' ? content : getMessageText(content);
    navigator.clipboard
        .writeText(textContent)
        .then(() => {
            pushMsg(t('aiSidebar.success.copySuccess'));
        })
        .catch(err => {
            pushErrMsg(t('aiSidebar.errors.copyFailed'));
            console.error('Copy failed:', err);
        });
}

// 处理复制事件，将选中的HTML内容转换为Markdown
export function handleCopyEvent(event: ClipboardEvent, messagesContainer: HTMLElement | null) {
    // 获取选区
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return; // 没有选中内容，不处理
    }

    // 检查选区是否在消息容器内
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // 只在插件本身的消息容器内处理复制，避免影响思源全局的复制行为。
    // messagesContainer 在组件中已被声明并用于渲染消息列表。
    // 我们要求选区既位于 messagesContainer 的子节点内，且在消息内容元素（.b3-typography）内。
    const messagesContainerEl = (messagesContainer as HTMLElement) || null;
    if (!messagesContainerEl) {
        // 没有消息容器引用，则不处理，保留默认复制行为
        return;
    }

    // 查找选区最近的元素节点起点
    let element: HTMLElement | null =
        container.nodeType === Node.ELEMENT_NODE
            ? (container as HTMLElement)
            : (container.parentElement as HTMLElement | null);

    let isInPluginContainer = false;
    let isInMessageContent = false;

    while (element) {
        if (element === messagesContainerEl) {
            isInPluginContainer = true;
        }
        if (element.classList && element.classList.contains('b3-typography')) {
            isInMessageContent = true;
        }
        // 如果同时满足在容器内且位于消息内容，则可处理
        if (isInPluginContainer && isInMessageContent) break;

        element = element.parentElement;
    }

    // 只有当选区在本插件的 messagesContainer 且在 .b3-typography 内，才处理转换
    if (!(isInPluginContainer && isInMessageContent)) {
        return;
    }

    // 阻止默认复制行为
    event.preventDefault();

    try {
        // 获取选中内容的HTML
        const div = document.createElement('div');
        div.appendChild(range.cloneContents());

        // 检查选区是否包含代码块或 code 元素
        // 使用更可靠的方式：检查选区开始/结束节点的祖先是否包含 code/pre
        const startContainer = range.startContainer as Node | null;
        const endContainer = range.endContainer as Node | null;
        const startElem =
            startContainer && startContainer.nodeType === Node.ELEMENT_NODE
                ? (startContainer as Element)
                : (startContainer?.parentElement as Element | null);
        const endElem =
            endContainer && endContainer.nodeType === Node.ELEMENT_NODE
                ? (endContainer as Element)
                : (endContainer?.parentElement as Element | null);

        // 检查是否包含公式元素
        const containsMath = !!div.querySelector(
            '.language-math, [data-subtype="math"], .katex'
        );

        // 检查是否在纯代码块内（开始和结束都在代码块内，且不包含公式）
        let isPureCodeBlock = false;
        if (!containsMath) {
            const startInCode = startElem && !!startElem.closest('pre, code');
            const endInCode = endElem && !!endElem.closest('pre, code');
            isPureCodeBlock = startInCode && endInCode;
        }

        // 如果是纯代码块选择（不包含公式），使用纯文本复制
        if (isPureCodeBlock) {
            const text = selection.toString();
            event.clipboardData?.setData('text/plain', text);
        } else {
            // 包含公式或混合内容，使用占位符方式处理
            const { html, placeholders } = extractMathFormulasToPlaceholders(div);

            // 使用思源的 Lute 将 HTML 转换为 Markdown
            if (window.Lute) {
                const lute = window.Lute.New();
                let markdown = lute.HTML2Md(html);

                // 将占位符还原为公式
                markdown = restorePlaceholdersToFormulas(markdown, placeholders);

                // 将Markdown写入剪贴板
                event.clipboardData?.setData('text/plain', markdown);
            } else {
                // 降级：如果Lute不可用，使用纯文本
                const text = selection.toString();
                event.clipboardData?.setData('text/plain', text);
            }
        }
    } catch (error) {
        console.error('Copy event handler error:', error);
        // 出错时使用默认行为（纯文本）
        const text = selection.toString();
        event.clipboardData?.setData('text/plain', text);
    }
}

// 提取公式并替换为占位符，避免被 Lute 转义
export function extractMathFormulasToPlaceholders(container: HTMLElement): {
    html: string;
    placeholders: Map<string, string>;
} {
    const placeholders = new Map<string, string>();
    let placeholderIndex = 0;

    // 生成唯一的占位符ID
    const generatePlaceholder = (formula: string, isBlock: boolean): string => {
        const id = `MATHFORMULA${placeholderIndex}ENDMATHFORMULA`;
        placeholderIndex++;
        placeholders.set(id, isBlock ? `\n$$\n${formula}\n$$\n` : `$${formula}$`);
        return id;
    };

    // 处理新格式的行内公式 span.language-math
    const inlineMathElements = Array.from(container.querySelectorAll('span.language-math'));
    inlineMathElements.forEach((mathElement: HTMLElement) => {
        let originalContent = mathElement.getAttribute('data-content');

        if (!originalContent) {
            const annotation = mathElement.querySelector(
                'annotation[encoding="application/x-tex"]'
            );
            if (annotation) {
                originalContent = annotation.textContent?.trim() || '';
            }
        }

        if (!originalContent) {
            // 尝试从未渲染的元素中提取
            const mathSpans = mathElement.querySelectorAll('span.katex-mathml');
            if (mathSpans.length > 0) {
                const annotation = mathSpans[0].querySelector(
                    'annotation[encoding="application/x-tex"]'
                );
                if (annotation) {
                    originalContent = annotation.textContent?.trim() || '';
                }
            }
        }

        if (originalContent) {
            const placeholder = generatePlaceholder(originalContent, false);
            const textNode = document.createTextNode(placeholder);
            mathElement.parentNode?.replaceChild(textNode, mathElement);
        }
    });

    // 处理新格式的块级公式 div.language-math
    const blockMathElements = Array.from(container.querySelectorAll('div.language-math'));
    blockMathElements.forEach((mathElement: HTMLElement) => {
        let originalContent = mathElement.getAttribute('data-content');

        if (!originalContent) {
            const annotation = mathElement.querySelector(
                'annotation[encoding="application/x-tex"]'
            );
            if (annotation) {
                originalContent = annotation.textContent?.trim() || '';
            }
        }

        if (!originalContent) {
            const mathSpans = mathElement.querySelectorAll('span.katex-mathml');
            if (mathSpans.length > 0) {
                const annotation = mathSpans[0].querySelector(
                    'annotation[encoding="application/x-tex"]'
                );
                if (annotation) {
                    originalContent = annotation.textContent?.trim() || '';
                }
            }
        }

        if (originalContent) {
            const placeholder = generatePlaceholder(originalContent, true);
            const textNode = document.createTextNode(placeholder);
            mathElement.parentNode?.replaceChild(textNode, mathElement);
        }
    });

    // 处理旧格式的公式元素（带 data-subtype="math" 属性）
    const oldMathElements = Array.from(container.querySelectorAll('[data-subtype="math"]'));
    oldMathElements.forEach((mathElement: HTMLElement) => {
        let originalContent = mathElement.getAttribute('data-content');

        if (!originalContent) {
            const annotation = mathElement.querySelector(
                'annotation[encoding="application/x-tex"]'
            );
            if (annotation) {
                originalContent = annotation.textContent?.trim() || '';
            }
        }

        if (originalContent) {
            const placeholder = generatePlaceholder(originalContent, false);
            const textNode = document.createTextNode(placeholder);
            mathElement.parentNode?.replaceChild(textNode, mathElement);
        }
    });

    // 处理所有 KaTeX 渲染后的元素
    const katexElements = Array.from(container.querySelectorAll('.katex'));
    katexElements.forEach((katexElement: HTMLElement) => {
        // 检查是否已被处理
        if (!katexElement.parentNode) {
            return;
        }

        let originalContent = '';

        // 首先尝试从 KaTeX 的 MathML annotation 中获取
        const annotation = katexElement.querySelector(
            'annotation[encoding="application/x-tex"]'
        );
        if (annotation) {
            originalContent = annotation.textContent?.trim() || '';
        }

        // 如果没有，尝试从父元素的 data-content 获取
        if (!originalContent) {
            const parent = katexElement.parentElement;
            if (parent) {
                originalContent = parent.getAttribute('data-content') || '';
            }
        }

        if (originalContent) {
            const isDisplay = katexElement.classList.contains('katex-display');
            const placeholder = generatePlaceholder(originalContent, isDisplay);
            const textNode = document.createTextNode(placeholder);
            katexElement.parentNode?.replaceChild(textNode, katexElement);
        }
    });

    return { html: container.innerHTML, placeholders };
}

// 将占位符还原为公式
export function restorePlaceholdersToFormulas(
    markdown: string,
    placeholders: Map<string, string>
): string {
    let result = markdown;

    // 按照占位符ID排序，确保按顺序替换
    const sortedPlaceholders = Array.from(placeholders.entries()).sort((a, b) => {
        const aNum = parseInt(a[0].match(/\d+/)?.[0] || '0');
        const bNum = parseInt(b[0].match(/\d+/)?.[0] || '0');
        return aNum - bNum;
    });

    sortedPlaceholders.forEach(([placeholder, formula]) => {
        // 使用全局替换，处理可能被 Lute 转义的情况
        result = result.split(placeholder).join(formula);
        // 也处理可能被转义的版本
        result = result.split(placeholder.replace(/\$/g, '\\$')).join(formula);
    });

    return result;
}

