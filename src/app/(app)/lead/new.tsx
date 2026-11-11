/** Create or edit a contact. `?id=` edits; `?phone=` prefills a new one. */
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { Button, Card, Chip, EmptyState, Input, Loading, Row, Screen, SectionHeader, Switch, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { useCreateLead, useFields, useLead, useTags, useUpdateLead } from '@/hooks/queries';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { coerceFieldValue, dropdownOptions, fieldDate, fieldLabel, formatFieldValue, isNumericField } from '@/services/crm/fields';
import type { Lead, LeadInput } from '@/services/crm/leads';
import type { CustomField } from '@ab-ecosystem/cpaas';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function LeadFormScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; phone?: string }>();
  const editing = !!params.id;
  const existing = useLead(params.id);
  if (editing && !existing.data) {
    return (
      <Screen title={t('leads.editLead')} back>
        {existing.isError ? (
          <EmptyState title={t('leads.notFound')} body={describeCrmError(existing.error)} action={t('common.retry')} onAction={() => void existing.refetch()} />
        ) : (
          <Loading label={t('common.loading')} />
        )}
      </Screen>
    );
  }
  // Keyed on the id only: a background refetch (a new message bumps updatedAt) must not wipe what is being typed.
  return <LeadForm key={existing.data?.id ?? 'new'} lead={existing.data ?? null} phone={params.phone} />;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

function LeadForm({ lead, phone }: { lead: Lead | null; phone?: string }) {
  const { t } = useTranslation();
  const editing = !!lead;
  const tags = useTags();
  const fields = useFields();
  const create = useCreateLead();
  const update = useUpdateLead();
  const [firstName, setFirstName] = useState(lead?.firstName ?? '');
  const [lastName, setLastName] = useState(lead?.lastName ?? '');
  const [number, setNumber] = useState(lead?.phone ?? phone ?? '');
  const [tagIds, setTagIds] = useState<string[]>(() => lead?.tags.map((tg) => tg.id) ?? []);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(lead?.fields ?? {}) }));
  const busy = create.isPending || update.isPending;

  /**
   * Only the fields that changed (or, for a new contact, that have a value), in the shape
   * each field's type holds. `null` names the first field whose value can't be read.
   */
  const fieldPatch = (): { patch: Record<string, unknown>; bad: string | null } => {
    const patch: Record<string, unknown> = {};
    for (const f of fields.data ?? []) {
      const raw = values[f.slug];
      if (lead && sameValue(raw, lead.fields[f.slug])) continue;
      const v = coerceFieldValue(f, raw);
      if (v === undefined) return { patch, bad: fieldLabel(f) };
      if (lead || v !== '') patch[f.slug] = v;
    }
    return { patch, bad: null };
  };

  const save = async () => {
    if (!editing && !normalizePhone(number)) return showAlert(t('leads.phoneNeeded'), t('leads.phoneNeededBody'));
    if (!editing && !firstName.trim() && !lastName.trim()) return showAlert(t('leads.nameNeeded'), t('leads.nameNeededBody'));
    const { patch, bad } = fieldPatch();
    if (bad) return showAlert(t('leads.badValue', { field: bad }));
    // Only what changed here: a name or tag set changed elsewhere since the form opened is not overwritten.
    const sameTags = !!lead && tagIds.length === lead.tags.length && tagIds.every((id) => lead.tags.some((tg) => tg.id === id));
    const input: LeadInput = {
      ...(!lead || firstName !== lead.firstName ? { firstName } : {}),
      ...(!lead || lastName !== lead.lastName ? { lastName } : {}),
      ...(!lead || !sameTags ? { tags: tagIds } : {}),
      fields: patch,
    };
    try {
      if (lead) {
        await update.mutateAsync({ lead, input });
        goBack();
      } else {
        const created = await create.mutateAsync({ ...input, phone: number });
        router.replace({ pathname: '/lead/[id]', params: { id: created.id } });
      }
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    }
  };

  return (
    <Screen
      title={editing ? t('leads.editLead') : t('leads.newLead')}
      back
      scroll
      footer={<Button title={editing ? t('leads.saveChanges') : t('leads.addLead')} size="lg" full onPress={() => void save()} loading={busy} />}
    >
      <View style={{ gap: 18, paddingTop: 4 }}>
        <FormSection title={t('leads.sectionContact')}>
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <Input label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoFocus={!editing} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('auth.lastName')} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </View>
          </Row>
          <PhoneInput
            label={t('auth.mobile')}
            value={number}
            onChange={setNumber}
            editable={!editing}
            hint={editing ? t('leads.phoneLocked', { phone: formatPhone(number) }) : undefined}
          />
          {tags.data?.length ? (
            <ChipField label={t('leads.tags')}>
              {tags.data.map((tg) => (
                <Chip
                  key={tg.id}
                  label={tg.name}
                  color={tg.color || undefined}
                  selected={tagIds.includes(tg.id)}
                  onPress={() => setTagIds((ids) => (ids.includes(tg.id) ? ids.filter((x) => x !== tg.id) : [...ids, tg.id]))}
                />
              ))}
            </ChipField>
          ) : null}
        </FormSection>
        {fields.isLoading ? <Loading /> : null}
        {fields.data?.length ? (
          <FormSection title={t('leads.sectionFields')}>
            {fields.data.map((f) => (
              <FieldInput key={f.slug} field={f} value={values[f.slug]} onChange={(v) => setValues((cur) => ({ ...cur, [f.slug]: v }))} />
            ))}
          </FormSection>
        ) : null}
      </View>
    </Screen>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={title} style={{ paddingHorizontal: 4 }} />
      <Card style={{ gap: 14 }}>{children}</Card>
    </View>
  );
}

function ChipField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {children}
      </Row>
    </View>
  );
}

/** Input for one of the workspace's fields, by its type. */
function FieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useTranslation();
  const label = fieldLabel(field);
  const str = value == null ? '' : String(value);
  if (field.dataType === 'dropdown') {
    return (
      <ChipField label={label}>
        {dropdownOptions(field).map((o) => (
          <Chip key={o} label={o} selected={str === o} onPress={() => onChange(str === o ? '' : o)} />
        ))}
      </ChipField>
    );
  }
  if (field.dataType === 'multi_select') {
    const list = Array.isArray(value) ? value.map(String) : [];
    return (
      <ChipField label={label}>
        {dropdownOptions(field).map((o) => (
          <Chip key={o} label={o} selected={list.includes(o)} onPress={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} />
        ))}
      </ChipField>
    );
  }
  // Structured values (an address, a location, a file) can't be typed as text: shown, not edited here.
  if (field.dataType === 'address' || field.dataType === 'location' || field.dataType === 'attachment' || (value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date))) {
    return (
      <View style={{ gap: 4 }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text>{value == null || value === '' ? '—' : formatFieldValue(field, value)}</Text>
        <Text variant="micro" tone="faint">
          {t('leads.editElsewhere')}
        </Text>
      </View>
    );
  }
  if (field.dataType === 'date' || field.dataType === 'timestamp') {
    const d = fieldDate(value);
    return (
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <DateTimeField
              value={d ?? new Date()}
              selected={!!d}
              label={d ? formatFieldValue(field, value) : t('leads.pickDate')}
              // Kept as a Date while editing; saved as YYYY-MM-DD (date) or ISO (timestamp).
              onChange={(next) => onChange(next)}
            />
          </View>
          {d ? <Button title={t('bulk.clear')} variant="ghost" size="sm" onPress={() => onChange('')} /> : null}
        </Row>
      </View>
    );
  }
  if (field.dataType === 'checkbox') {
    return (
      <Row gap={10} style={{ justifyContent: 'space-between' }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {label}
        </Text>
        <Switch value={value === true || value === 'true'} onChange={onChange} />
      </Row>
    );
  }
  const numeric = isNumericField(field.dataType);
  return (
    <Input
      label={label}
      hint={field.caption}
      value={str}
      multiline={field.dataType === 'textarea'}
      keyboardType={
        numeric ? 'decimal-pad' : field.dataType === 'phone' ? 'phone-pad' : field.dataType === 'email' ? 'email-address' : field.dataType === 'url' ? 'url' : 'default'
      }
      autoCapitalize={field.dataType === 'email' || field.dataType === 'url' ? 'none' : 'sentences'}
      // Numbers stay text while typing ("12." or "0.5" must survive); the form converts them on save.
      onChangeText={(v) => onChange(numeric ? v.replace(/[^\d.,-]/g, '') : v)}
    />
  );
}

/** New contact needs CREATE, editing one UPDATE: a member without it gets a short explanation instead. */
export default function LeadFormScreenGate() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <RequireCan any={[id ? P.contacts.update : P.contacts.create]}>
      <LeadFormScreen />
    </RequireCan>
  );
}
