// Expo Go で開く EAS Update の設定。Expo Go は自分の SDK と同じ runtimeVersion（exposdk:57.0.0）の更新だけを開く。
// updates.url は `npx eas-cli init` が app.json の extra.eas.projectId に入れるプロジェクトIDから作る。
// Expo Go のプロジェクトの一覧は、更新の中の iconUrl（https の絵。expo-manifests の iosAppIconUrl）を出し、icon の相対パスは使わない。
// iconUrl は app config の型にない項目で expo-doctor が落とすので、公開のワークフロー（mobile.yml）が EXPO_GO_ICON_URL を渡したときだけ入れる
module.exports = ({ config }) => {
  const projectId = config.extra?.eas?.projectId;
  return {
    ...config,
    runtimeVersion: { policy: 'sdkVersion' },
    ...(process.env.EXPO_GO_ICON_URL ? { iconUrl: process.env.EXPO_GO_ICON_URL } : {}),
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
  };
};
