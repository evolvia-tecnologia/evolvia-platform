'use client';

import ScientificEvaHelp, { type EvaHelpQuestion } from './scientific-eva-help';
import { EVA_SUPPORT_GUIDES, type EvaSupportGuideId } from '../lib/eva-support-guides';

export default function EvaScreenSupport({ guide, additionalQuestions = [] }: { guide: EvaSupportGuideId; additionalQuestions?: EvaHelpQuestion[] }) {
  const item = EVA_SUPPORT_GUIDES[guide];
  return <ScientificEvaHelp context={item.context} intro={item.intro} questions={[...item.questions, ...additionalQuestions]} />;
}
