import { Redirect } from 'expo-router';

/** Never shown: the tab's press handler opens the wizard instead. Kept as a route only so the tab exists. */
export default function GenerateTab() {
  return <Redirect href="/report/new" />;
}
