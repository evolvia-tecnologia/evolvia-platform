import { Suspense } from 'react';
import ScientificStationSearch from '../../../../components/scientific-station-search';

export default function ScientificStationPage() {
  return <Suspense fallback={null}><ScientificStationSearch /></Suspense>;
}
