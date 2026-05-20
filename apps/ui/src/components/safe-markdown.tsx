import Markdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import type { Options as RehypeSanitizeOptions } from "rehype-sanitize"
import { cn } from "@/lib/utils.ts"

interface SafeMarkdownProps {
  children: string
  className?: string
}

const safeMarkdownSchema: RehypeSanitizeOptions = {
  allowComments: false,
  allowDoctypes: false,
  ancestors: {
    tbody: ["table"],
    td: ["table"],
    tfoot: ["table"],
    th: ["table"],
    thead: ["table"],
    tr: ["table"]
  },
  attributes: {
    a: ["href"],
    details: ["open"]
  },
  protocols: {
    href: ["http", "https", "mailto"]
  },
  required: {},
  strip: [
    "audio",
    "button",
    "canvas",
    "embed",
    "form",
    "iframe",
    "img",
    "input",
    "math",
    "object",
    "picture",
    "script",
    "select",
    "source",
    "style",
    "svg",
    "textarea",
    "video"
  ],
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "details",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul"
  ]
}

const markdownClassName =
  "prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-a:text-primary prose-blockquote:border-l-border prose-blockquote:text-muted-foreground prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-card prose-pre:px-4 prose-pre:py-4 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-table:w-full prose-table:border-collapse prose-th:border-b prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:text-left prose-td:border-b prose-td:border-border/60 prose-td:px-3 prose-td:py-2 prose-td:align-top prose-strong:text-foreground"

export function SafeMarkdown({ children, className }: SafeMarkdownProps) {
  return (
    <div className={cn(markdownClassName, className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, safeMarkdownSchema]]}
      >
        {children}
      </Markdown>
    </div>
  )
}
