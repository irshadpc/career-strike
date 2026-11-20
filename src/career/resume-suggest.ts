import { randomBytes } from 'node:crypto';
import { canonicalSkill } from '../matching/skills.js';
import type { Db } from '../store/db.js';
import type { ProfileFact } from './profile.js';
import { extractResumeFacts } from './resume-facts.js';

// Re-export toFact type usage: profile.ts toFact is not exported; reimplement row fetch.
interface Row {
  id: string;
  kind: string;
  value_json: string;
  source: string;
  approved: number;
  created_at: string;
  updated_at: string;
}

function rowToFact(r: Row): ProfileFact {
  return {
    id: r.id,
    kind: r.kind as ProfileFact['kind'],
    value: JSON.parse(r.value_json) as Record<string, unknown>,
    source: r.source as 'user' | 'document',
    approved: r.approved === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function suggestResumeFacts(db: Db, text: string, actor: string): ProfileFact[] {
  const facts = extractResumeFacts(text);
  const at = new Date().toISOString();
  const createdIds: string[] = [];

  // Existing facts for dedup
  const existingRows = db.prepare('SELECT kind, value_json FROM profile_facts').all() as {
    kind: string;
    value_json: string;
  }[];
  const existingSkills = new Set<string>();
  const existingRoles = new Set<string>();
  const existingEdu = new Set<string>();
  const existingCert = new Set<string>();
  const existingLang = new Set<string>();
  for (const row of existingRows) {
    try {
      const val = JSON.parse(row.value_json) as Record<string, unknown>;
      if (row.kind === 'skill' && typeof val.name === 'string') {
        existingSkills.add(val.name.toLowerCase());
        const c = canonicalSkill(val.name);
        if (c) existingSkills.add(c.toLowerCase());
      } else if (row.kind === 'role') {
        existingRoles.add(
          `${String(val.title ?? '').toLowerCase()}|${String(val.employer ?? '').toLowerCase()}|${String(val.startYear ?? '')}`,
        );
      } else if (row.kind === 'education') {
        existingEdu.add(
          `${String(val.qualification ?? '').toLowerCase()}|${String(val.institution ?? '').toLowerCase()}`,
        );
      } else if (row.kind === 'certification') {
        existingCert.add(`${String(val.name ?? '').toLowerCase()}|${String(val.issuer ?? '').toLowerCase()}`);
      } else if (row.kind === 'language') {
        existingLang.add(String(val.name ?? '').toLowerCase());
      }
    } catch {}
  }

  const insert = db.prepare(
    "INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at) VALUES (?, ?, ?, 'document', 0, ?, ?)",
  );

  db.transaction(() => {
    // skills
    for (const s of facts.skills) {
      const norm = canonicalSkill(s.name) ?? s.name;
      if (existingSkills.has(norm.toLowerCase()) || existingSkills.has(s.name.toLowerCase())) continue;
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insert.run(id, 'skill', JSON.stringify({ name: norm, years: null, level: null }), at, at);
      existingSkills.add(norm.toLowerCase());
      createdIds.push(id);
    }
    // roles
    for (const r of facts.roles) {
      const key = `${r.title.toLowerCase()}|${(r.employer ?? '').toLowerCase()}|${r.startYear}`;
      if (existingRoles.has(key)) continue;
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insert.run(
        id,
        'role',
        JSON.stringify({
          title: r.title,
          employer: r.employer,
          startYear: r.startYear,
          endYear: r.endYear,
          summary: r.summary,
        }),
        at,
        at,
      );
      existingRoles.add(key);
      createdIds.push(id);
    }
    // education
    for (const e of facts.education) {
      const key = `${e.qualification.toLowerCase()}|${(e.institution ?? '').toLowerCase()}`;
      if (existingEdu.has(key)) continue;
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insert.run(
        id,
        'education',
        JSON.stringify({ qualification: e.qualification, institution: e.institution, year: e.year }),
        at,
        at,
      );
      existingEdu.add(key);
      createdIds.push(id);
    }
    // certifications
    for (const c of facts.certifications) {
      const key = `${c.name.toLowerCase()}|${(c.issuer ?? '').toLowerCase()}`;
      if (existingCert.has(key)) continue;
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insert.run(id, 'certification', JSON.stringify({ name: c.name, issuer: c.issuer, year: c.year }), at, at);
      existingCert.add(key);
      createdIds.push(id);
    }
    // languages
    for (const l of facts.languages) {
      const key = l.name.toLowerCase();
      if (existingLang.has(key)) continue;
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insert.run(id, 'language', JSON.stringify({ name: l.name, level: l.level }), at, at);
      existingLang.add(key);
      createdIds.push(id);
    }
    if (createdIds.length > 0) {
      db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(
        at,
        actor,
        'profile.resume.suggested',
        `${createdIds.length} suggested`,
      );
    }
  })();

  return createdIds.map((id) => rowToFact(db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row));
}
