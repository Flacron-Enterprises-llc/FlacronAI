import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { parseInline, parseMarkdown, type Block } from './parseMarkdown';

/** Native counterpart of frontend/src/components/ReportMarkdown.jsx — same visual hierarchy: navy h1 with a rule,
 * h2 as an orange-edged band, uppercase h4, amber blockquotes, bordered tables (scroll sideways on phones). */
export function ReportMarkdown({ content }: { content: string | null | undefined }) {
  const theme = useTheme();
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const c = theme.colors;
  const f = theme.typography.fontFamily;
  const body = { color: c.ink, fontFamily: f.body, fontSize: 15, lineHeight: 23 };

  const inline = (text: string) =>
    parseInline(text).map((span, i) => (
      <Text
        key={i}
        style={
          span.bold
            ? { fontFamily: f.bodySemiBold, color: c.ink }
            : span.italic
              ? { fontStyle: 'italic', color: c.muted }
              : span.code
                ? { fontFamily: 'monospace', backgroundColor: c.surface }
                : undefined
        }
      >
        {span.text}
      </Text>
    ));

  const render = (b: Block, key: number) => {
    switch (b.type) {
      case 'heading':
        if (b.level === 1)
          return (
            <Text key={key} accessibilityRole="header" style={[styles.h1, { color: c.navy, fontFamily: f.display, borderBottomColor: c.border }]}>
              {inline(b.text)}
            </Text>
          );
        if (b.level === 2)
          return (
            <View key={key} style={[styles.h2, { backgroundColor: c.primarySoft, borderLeftColor: c.primary }]}>
              <Text accessibilityRole="header" style={{ color: c.navy, fontFamily: f.display, fontSize: 17 }}>
                {inline(b.text)}
              </Text>
            </View>
          );
        if (b.level === 3)
          return (
            <Text key={key} accessibilityRole="header" style={[styles.h3, { color: c.ink, fontFamily: f.bodySemiBold }]}>
              {inline(b.text)}
            </Text>
          );
        return (
          <Text key={key} accessibilityRole="header" style={[styles.h4, { color: c.muted, fontFamily: f.bodySemiBold }]}>
            {b.text.toUpperCase()}
          </Text>
        );
      case 'paragraph':
        return (
          <Text key={key} style={[body, styles.p]}>
            {inline(b.text)}
          </Text>
        );
      case 'list':
        return (
          <View key={key} style={styles.list}>
            {b.items.map((item, i) => (
              <View key={i} style={styles.li}>
                <Text style={[body, styles.marker]}>{b.ordered ? `${i + 1}.` : '•'}</Text>
                <Text style={[body, styles.liText]}>{inline(item)}</Text>
              </View>
            ))}
          </View>
        );
      case 'quote':
        return (
          <View key={key} style={[styles.quote, { borderLeftColor: '#FBBF24', backgroundColor: c.warning + '14' }]}>
            <Text style={[body, { color: c.ink }]}>{inline(b.text)}</Text>
          </View>
        );
      case 'hr':
        return <View key={key} style={[styles.hr, { backgroundColor: c.border }]} />;
      case 'code':
        return (
          <ScrollView key={key} horizontal style={[styles.code, { backgroundColor: '#001633' }]}>
            <Text style={styles.codeText}>{b.text}</Text>
          </ScrollView>
        );
      case 'table':
        return (
          <ScrollView key={key} horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
            <View style={[styles.table, { borderColor: c.border }]}>
              {[b.header, ...b.rows].map((row, r) => (
                <View key={r} style={[styles.tr, r === 0 && { backgroundColor: c.surface }]}>
                  {b.header.map((_, col) => (
                    <View key={col} style={[styles.td, { borderColor: c.border }]}>
                      <Text style={[body, { fontSize: 13, lineHeight: 19 }, r === 0 && { fontFamily: f.bodySemiBold }]}>
                        {inline(row[col] ?? '')}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      default:
        return null;
    }
  };

  return <View>{blocks.map(render)}</View>;
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, marginTop: 4, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1 },
  h2: { borderLeftWidth: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 20, marginBottom: 10 },
  h3: { fontSize: 16, marginTop: 16, marginBottom: 6 },
  h4: { fontSize: 12, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  p: { marginVertical: 6 },
  list: { marginVertical: 8, gap: 6 },
  li: { flexDirection: 'row', paddingLeft: 4 },
  marker: { width: 22 },
  liText: { flex: 1 },
  quote: { borderLeftWidth: 4, borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginVertical: 12 },
  hr: { height: 1, marginVertical: 18 },
  code: { borderRadius: 12, padding: 14, marginVertical: 12 },
  codeText: { color: '#F3F4F6', fontFamily: 'monospace', fontSize: 13, lineHeight: 20 },
  tableWrap: { marginVertical: 12 },
  table: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  td: { width: 150, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8 },
});
