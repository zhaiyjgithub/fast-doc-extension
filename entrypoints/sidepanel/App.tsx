import { BookOpen, Search, Star, Zap, GitFork, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const features = [
  {
    icon: <Search className="size-5 text-primary" />,
    title: '快速搜索',
    description: '一键搜索技术文档，快速定位所需内容。',
    badge: 'New',
  },
  {
    icon: <BookOpen className="size-5 text-primary" />,
    title: '文档阅读',
    description: '内置阅读模式，去除广告噪音，专注核心内容。',
    badge: null,
  },
  {
    icon: <Star className="size-5 text-primary" />,
    title: '收藏管理',
    description: '收藏常用文档页面，随时快速访问。',
    badge: null,
  },
  {
    icon: <Zap className="size-5 text-primary" />,
    title: 'AI 摘要',
    description: '利用 AI 自动提取文档核心要点。',
    badge: 'Beta',
  },
];

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Fast Doc</span>
        </div>
        <Badge variant="secondary">v0.0.1</Badge>
      </header>

      {/* Search Bar */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Search className="size-4 shrink-0" />
          <span>搜索文档…</span>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Welcome Card */}
        <Card>
          <CardHeader>
            <CardTitle>欢迎使用 Fast Doc</CardTitle>
            <CardDescription>
              在侧边栏中快速查阅技术文档，提升开发效率。
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size="sm" className="gap-1.5">
              开始使用 <ArrowRight className="size-3.5" />
            </Button>
          </CardFooter>
        </Card>

        <Separator />

        {/* Features */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            核心功能
          </p>
          <div className="space-y-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-sm"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  {f.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    {f.badge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {f.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Button variants showcase */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            组件预览
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Primary</Button>
            <Button size="sm" variant="secondary">Secondary</Button>
            <Button size="sm" variant="outline">Outline</Button>
            <Button size="sm" variant="ghost">Ghost</Button>
            <Button size="sm" variant="destructive">Danger</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-4 py-3">
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground">
          <GitFork className="size-4" />
          查看源码
        </Button>
      </footer>
    </div>
  );
}
