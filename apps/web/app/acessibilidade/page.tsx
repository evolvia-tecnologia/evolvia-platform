import type { Metadata } from 'next';
import PublicHelpArticleView from '../../components/public-help-article';
import { publicHelpArticle } from '../../lib/public-help';

const article = publicHelpArticle('acessibilidade');

export const metadata: Metadata = {
  title: 'Acessibilidade',
  description: article?.description ?? 'Acessibilidade do site público da Evolvia.',
};

export default function AccessibilityPage() {
  if (!article) return null;
  return <PublicHelpArticleView article={article} />;
}
