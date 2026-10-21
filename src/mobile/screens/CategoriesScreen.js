// カテゴリの管理。追加、↑↓ での並べ替え、削除（ブックマークは消さず「未分類」に出る）
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ops, LIMITS } from '../../shared/store.js';
import { toneOf } from '../../shared/view.js';
import { colors, tones, ui } from '../theme';
import { Btn, Status } from '../parts';

function Icon({ label, onPress, disabled, danger }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 4, opacity: disabled ? 0.3 : 1 }}>
      <Text style={{ fontSize: 18, color: danger ? colors.danger : colors.text }}>{label}</Text>
    </Pressable>
  );
}

export default function CategoriesScreen({ data, canEdit, save }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null);
  // 保存の間は操作させない。続けて ↑↓ を押すと、保存前の並びから入れ替えて上書きしてしまうため
  const [busy, setBusy] = useState(false);
  const categories = data?.categories ?? [];
  const run = (mutate, message, done) => {
    setBusy(true);
    save(mutate, message)
      .then(() => { setStatus(null); done?.(); }, (err) => setStatus({ text: err?.message ?? '保存できませんでした。', kind: 'error' }))
      .finally(() => setBusy(false));
  };

  const move = (i, j) => {
    const names = [...categories];
    [names[i], names[j]] = [names[j], names[i]];
    run(ops.sortCategories(names), 'Sort categories');
  };
  const remove = (c) => Alert.alert(`「${c}」を削除しますか？`, 'このカテゴリのブックマークは消えず、「未分類」に出ます。', [
    { text: 'やめる', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => run(ops.removeCategory(c), `Delete category ${c}`) },
  ]);
  const add = () => run(ops.addCategory(name), `Add category ${name.trim()}`, () => setName(''));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      {!canEdit && <Text style={ui.muted}>編集にはトークンが要ります。「設定」で入れてください。</Text>}
      {!data && <Text style={ui.muted}>一覧を読み込めていません。</Text>}
      {categories.map((c, i) => {
        const [fg, bg] = tones[toneOf(categories, c)];
        return (
          <View key={c} style={[ui.row, { backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.line, paddingLeft: 12, paddingVertical: 6 }]}>
            <View style={{ backgroundColor: bg, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: fg, fontWeight: '600' }}>{c}</Text>
            </View>
            <Text style={[ui.muted, { flex: 1 }]}>{data.bookmarks.filter((b) => b.category === c).length}件</Text>
            {canEdit && (
              <>
                <Icon label="↑" disabled={busy || i === 0} onPress={() => move(i, i - 1)} />
                <Icon label="↓" disabled={busy || i === categories.length - 1} onPress={() => move(i, i + 1)} />
                <Icon label="×" danger disabled={busy} onPress={() => remove(c)} />
              </>
            )}
          </View>
        );
      })}
      {canEdit && data && (
        <View style={ui.row}>
          <TextInput style={[ui.input, { flex: 1 }]} value={name} onChangeText={setName} onSubmitEditing={add} placeholder={`新しいカテゴリ（${LIMITS.category}文字まで）`} maxLength={LIMITS.category} returnKeyType="done" />
          <Btn title="追加" onPress={add} disabled={busy || !name.trim()} />
        </View>
      )}
      <Status status={status} />
    </ScrollView>
  );
}
