// Expo Go で開く EAS Update の設定。Expo Go は自分の SDK と同じ runtimeVersion（exposdk:57.0.0）の更新だけを開く。
// updates.url は `npx eas-cli init` が app.json の extra.eas.projectId に入れるプロジェクトIDから作る
module.exports = ({ config }) => {
  const projectId = config.extra?.eas?.projectId;
  return {
    ...config,
    runtimeVersion: { policy: 'sdkVersion' },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
  };
};
