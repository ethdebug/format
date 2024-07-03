/**
 * POSSIBLE HACK WARNING
 *
 * This component (LinkedCodeBlock) manipulates the DOM directly to create
 * linked code blocks. While effective, this approach bypasses React's virtual
 * DOM, which could potentially lead to unexpected behavior or performance
 * issues.
 *
 * The component works by:
 *   1. Rendering a standard CodeBlock component
 *   2. Using a ref to access the rendered DOM
 *   3. Processing the DOM to replace specified text with Link components
 *   4. Re-rendering the processed code
 *
 * This approach is used because the CodeBlock component doesn't provide a way
 * to inject custom elements (like links) into its rendered output.
 *
 * Potential issues:
 *   - May break if the internal structure of CodeBlock changes
 *   - Could cause performance issues with large code blocks or many links
 *   - Might interfere with other components or scripts that manipulate the
 *     same DOM elements
 *
 * Use with caution and consider alternatives if available.
 */
import React, { useRef, useEffect, useState } from "react";
import CodeBlock, { type Props as CodeBlockProps } from "@theme/CodeBlock";
import Link from "@docusaurus/Link";

export interface Links {
  [key: string]: string;
}

export interface Props extends Omit<CodeBlockProps, "children"> {
  code: string;
  links: Links;
}

export default function LinkedCodeBlock({
  code,
  links,
  ...codeBlockProps
}: Props): JSX.Element {
  const codeRef = useRef<HTMLDivElement>(null);
  const [processedCode, setProcessedCode] = useState<JSX.Element | null>(null);

  useEffect(() => {
    function processCodeElement() {
      if (codeRef.current) {
        const codeElement = codeRef.current.querySelector("pre > code");
        if (codeElement) {
          const processedNodes = Array.from(codeElement.childNodes).flatMap(
            (node) => processNode(node, links)
          );
          setProcessedCode(
            <pre className={codeElement.parentElement?.className}>
              <code className={codeElement.className}>{processedNodes}</code>
            </pre>
          );
        }
      }
    }

    processCodeElement();

    // Re-process if the ref's content changes
    const observer = new MutationObserver(processCodeElement);
    if (codeRef.current) {
      observer.observe(codeRef.current, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [code, links]);

  if (!processedCode) {
    return (
      <div ref={codeRef}>
        <CodeBlock {...codeBlockProps}>{code}</CodeBlock>
      </div>
    );
  }

  return processedCode;
}

type ProcessedNode =
  | JSX.Element
  | (JSX.Element | string)[];

// Recursively process a DOM node and its children
function processNode(node: Node, links: Links): ProcessedNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return processTextNode(node as Text, links);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return processElementNode(node as HTMLElement, links);
  }

  return [];
}

// Process a text node to replace linkable text with Link components
function processTextNode(node: Text, links: Links): ProcessedNode {
  const result: (JSX.Element | string)[] = [];
  let text = node.textContent || "";
  let lastIndex = 0;

  for (const [linkText, url] of Object.entries(links)) {
    let index = text.indexOf(linkText, lastIndex);
    while (index !== -1) {
      if (index > lastIndex) {
        result.push(text.slice(lastIndex, index));
      }
      result.push(
        <Link
          key={`${linkText}-${index}`}
          to={url}
          className="linked-code-block-link"
        >
          {linkText}
        </Link>
      );
      lastIndex = index + linkText.length;
      index = text.indexOf(linkText, lastIndex);
    }
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

// counter for `key` prop to ensure uniqueness
let nodeKey: number = 0;
// elements that do not allow closing tags
const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

function processElementNode(node: HTMLElement, links: Links): ProcessedNode {
  const tagName = node.tagName.toLowerCase();

  const props: any = {
    // increment the node key so everything is unique
    key: nodeKey++,
    className: node.className,
  };

  if (node.style && node.style.cssText) {
    props.style = convertStyleToObject(node.style.cssText);
  }

  if (voidElements.has(tagName)) {
    return React.createElement(tagName, props);
  }

  const children = Array.from(node.childNodes)
    .flatMap((child) => processNode(child, links));

  return React.createElement(tagName, props, children);
}

function convertStyleToObject(style: string): React.CSSProperties {
  const styleObject: React.CSSProperties = {};
  for (const declaration of style.split(";")) {
    if (declaration) {
      const [property, value] = declaration.split(":");
      if (property && value) {
        const camelCaseProperty = property.trim().replace(
          /-./g,
          (x) => x[1].toUpperCase()
        );
        // HACK coerce object instead of key to avoid a giant keyof union
        (styleObject as any)[camelCaseProperty] = value.trim();
      }
    }
  }
  return styleObject;
}
