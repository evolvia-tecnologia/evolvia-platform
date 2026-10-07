'use client';

import ScientificEvaHelp from './scientific-eva-help';
import { EVA_SUPPORT_GUIDES, type EvaSupportGuideId } from '../lib/eva-support-guides';

export default function EvaScreenSupport({ guide }: { guide: EvaSupportGuideId }) {
  const item = EVA_SUPPORT_GUIDES[guide];
  return <ScientificEvaHelp context={item.context} intro={item.intro} questions={item.questions} />;
}
