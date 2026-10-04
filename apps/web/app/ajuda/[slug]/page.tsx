import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicHelpArticleView from '../../../components/public-help-article';
import { PUBLIC_HELP_ARTICLES, publicHelpArticle } from '../../../lib/public-help';

export function generateStaticParams() {
  return PUBLIC_HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = publicHelpArticle(slug);
  if (!article) return { title: 'Ajuda' };
  return { title: article.title, description: article.description };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = publicHelpArticle(slug);
  if (!article) notFound();
  return <PublicHelpArticleView article={article} />;
}
