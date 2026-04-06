import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  category: string
  tags: string[]
  author: string
  readingTime: string
  featured: boolean
  content: string
}

const POSTS_DIR = path.join(process.cwd(), 'content/blog')

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(POSTS_DIR)) return []
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.mdx') && !f.includes(' 2.'))
  return files
    .map(file => {
      const slug = file.replace('.mdx', '')
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8')
      const { data, content } = matter(raw)
      return {
        slug,
        title: data.title,
        description: data.description,
        date: data.date,
        category: data.category || 'General',
        tags: data.tags || [],
        author: data.author || 'Equipo OPAI',
        readingTime: readingTime(content).text,
        featured: data.featured || false,
        content,
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | null {
  const file = path.join(POSTS_DIR, `${slug}.mdx`)
  if (!fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    category: data.category || 'General',
    tags: data.tags || [],
    author: data.author || 'Equipo OPAI',
    readingTime: readingTime(content).text,
    featured: data.featured || false,
    content,
  }
}

export const BLOG_CATEGORIES = ['Operaciones', 'IA y Tecnología', 'Compliance', 'Gestión', 'Recursos']
