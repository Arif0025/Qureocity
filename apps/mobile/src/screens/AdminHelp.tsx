import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { helpArticlesFor, type HelpArticle } from '../../../../lib/help/articles';
import { colors as C } from '../theme/tokens';

export default function AdminHelp({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const articles = useMemo(() => helpArticlesFor(true), []);
  const active = articles.find((article) => article.slug === activeSlug) ?? null;
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = normalized ? articles.filter((article) =>
      article.title.toLowerCase().includes(normalized)
      || article.category.toLowerCase().includes(normalized)
      || article.body.toLowerCase().includes(normalized)
      || article.keywords.some((keyword) => keyword.toLowerCase().includes(normalized)),
    ) : articles;
    const byCategory = new Map<string, HelpArticle[]>();
    matching.forEach((article) => byCategory.set(article.category, [...(byCategory.get(article.category) ?? []), article]));
    return [...byCategory.entries()];
  }, [articles, query]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={active ? () => setActiveSlug(null) : onBack} style={styles.backButton}>
            <Text style={styles.backText}>{active ? '‹ Help' : '‹ Overview'}</Text>
          </Pressable>
          <Text style={styles.headerLabel}>Help</Text>
          <View style={styles.headerSpacer} />
        </View>

        {active ? <>
          <Text style={styles.category}>{active.category.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={styles.title}>{active.title}</Text>
          <View style={styles.articleCard}>
            {active.body.split('\n\n').map((paragraph, index) => <Text key={`${active.slug}-${index}`} style={styles.paragraph}>{paragraph}</Text>)}
          </View>
        </> : <>
          <Text accessibilityRole="header" style={styles.title}>Help</Text>
          <Text style={styles.description}>Find answers and guidance for your QureoCity workspace.</Text>
          <TextInput accessibilityLabel="Search help articles" value={query} onChangeText={setQuery} placeholder="Search help articles…" placeholderTextColor={C.muted} style={styles.searchInput} />
          {!groups.length ? <View style={styles.empty}><Text style={styles.emptyText}>No help articles match that search.</Text></View> : groups.map(([category, items]) => <View key={category} style={styles.group}>
            <Text style={styles.category}>{category.toUpperCase()}</Text>
            <View style={styles.articleList}>{items.map((article, index) => <Pressable key={article.slug} accessibilityRole="button" onPress={() => setActiveSlug(article.slug)} style={({ pressed }) => [styles.articleRow, index === items.length - 1 && styles.articleRowLast, pressed && styles.pressed]}>
              <Text style={styles.articleTitle}>{article.title}</Text><Text style={styles.chevron}>›</Text>
            </Pressable>)}</View>
          </View>)}
        </>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 112 },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backButton: { minWidth: 65, minHeight: 40, justifyContent: 'center' },
  backText: { color: C.plum, fontSize: 12, fontWeight: '800' },
  headerLabel: { color: C.ink, fontSize: 12, fontWeight: '800' },
  headerSpacer: { width: 65 },
  title: { color: C.ink, fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 5 },
  description: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 15 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 13, backgroundColor: C.surface, color: C.ink, paddingHorizontal: 14, fontSize: 13, marginBottom: 23 },
  group: { marginBottom: 21 },
  category: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  articleList: { overflow: 'hidden', borderWidth: 1, borderColor: C.line, borderRadius: 15, backgroundColor: C.surface },
  articleRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#ECE7DC' },
  articleRowLast: { borderBottomWidth: 0 },
  articleTitle: { flex: 1, color: C.ink, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  chevron: { color: C.muted, fontSize: 20 },
  articleCard: { gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, backgroundColor: C.surface, marginTop: 10 },
  paragraph: { color: C.ink, fontSize: 12, lineHeight: 19 },
  empty: { borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, padding: 18 },
  emptyText: { color: C.muted, fontSize: 11 },
  pressed: { opacity: 0.82 },
});
