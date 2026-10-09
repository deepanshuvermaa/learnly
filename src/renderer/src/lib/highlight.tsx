import type { ReactNode } from 'react'
import type { CodeLanguage } from '@shared/types'

/**
 * A small single-pass highlighter: comments, strings, numbers and keywords.
 * Enough to make generated snippets scannable at a glance without pulling in
 * Prism and its grammar bundle for eight languages.
 */

const KEYWORDS: Record<CodeLanguage, string[]> = {
  typescript: [
    'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete',
    'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'implements',
    'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'private', 'protected', 'public',
    'readonly', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof',
    'undefined', 'var', 'void', 'while', 'yield'
  ],
  javascript: [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'else',
    'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let',
    'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
    'undefined', 'var', 'void', 'while', 'yield'
  ],
  python: [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'self', 'True', 'try', 'while', 'with', 'yield'
  ],
  go: [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'false', 'for', 'func',
    'go', 'goto', 'if', 'import', 'interface', 'map', 'nil', 'package', 'range', 'return', 'select', 'struct',
    'switch', 'true', 'type', 'var'
  ],
  java: [
    'abstract', 'boolean', 'break', 'case', 'catch', 'class', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'false', 'final', 'finally', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface',
    'long', 'new', 'null', 'package', 'private', 'protected', 'public', 'record', 'return', 'static', 'super',
    'switch', 'this', 'throw', 'throws', 'true', 'try', 'var', 'void', 'while'
  ],
  rust: [
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'false', 'fn', 'for', 'if', 'impl',
    'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct',
    'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'
  ],
  sql: [
    'ADD', 'ALTER', 'AND', 'AS', 'ASC', 'BEGIN', 'BETWEEN', 'BY', 'CASE', 'COMMIT', 'CONSTRAINT', 'CREATE', 'DELETE',
    'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'EXISTS', 'FOREIGN', 'FROM', 'GROUP', 'HAVING', 'IN', 'INDEX', 'INNER',
    'INSERT', 'INTO', 'IS', 'JOIN', 'KEY', 'LEFT', 'LIMIT', 'NOT', 'NULL', 'OFFSET', 'ON', 'OR', 'ORDER', 'PRIMARY',
    'REFERENCES', 'RETURNING', 'RIGHT', 'ROLLBACK', 'SELECT', 'SET', 'TABLE', 'THEN', 'UNION', 'UNIQUE', 'UPDATE',
    'VALUES', 'WHEN', 'WHERE', 'WITH'
  ],
  bash: [
    'case', 'do', 'done', 'echo', 'elif', 'else', 'esac', 'exit', 'export', 'fi', 'for', 'function', 'if', 'in',
    'local', 'readonly', 'return', 'set', 'then', 'until', 'while'
  ]
}

const COMMENT: Record<CodeLanguage, string> = {
  typescript: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  javascript: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  go: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  java: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  rust: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  python: '#[^\\n]*',
  bash: '#[^\\n]*',
  sql: '--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/'
}

const STRING = '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`'
const NUMBER = '\\b\\d[\\d_]*(?:\\.\\d+)?\\b'

const COLORS = {
  comment: 'var(--color-slate)',
  string: '#d6c3a1',
  number: '#9fb6e6',
  keyword: '#a49df7'
}

const cache = new Map<CodeLanguage, RegExp>()

function tokenizer(language: CodeLanguage): RegExp {
  let re = cache.get(language)
  if (!re) {
    const flags = language === 'sql' ? 'gi' : 'g'
    re = new RegExp(`(${COMMENT[language]})|(${STRING})|(${NUMBER})|\\b(${KEYWORDS[language].join('|')})\\b`, flags)
    cache.set(language, re)
  }
  re.lastIndex = 0
  return re
}

export function highlight(code: string, language: CodeLanguage): ReactNode[] {
  const re = tokenizer(language)
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const kind = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'number' : 'keyword'
    out.push(
      <span key={m.index} style={{ color: COLORS[kind], fontStyle: kind === 'comment' ? 'italic' : undefined }}>
        {m[0]}
      </span>
    )
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}
