import { Suspense } from 'react';
import ScientificStationAbstract from '../../../../../components/scientific-station-abstract';

export default function ScientificStationAbstractPage() {
  return <Suspense fallback={null}><ScientificStationAbstract /></Suspense>;
}
