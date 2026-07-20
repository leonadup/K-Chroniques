-- Migration 006 — Onglet Coréen (espace strictement personnel, jamais
-- exposé aux cercles) : unités de vocabulaire, progression façon Leitner
-- (répétition espacée), XP et streak. Voir README pour le détail.

create table if not exists coreen_units (
  id text primary key,
  title text not null,
  icon text,
  sort_order int not null default 0
);

create table if not exists coreen_items (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references coreen_units(id) on delete cascade,
  korean text not null,
  romanization text,
  french text not null,
  note text,
  sort_order int not null default 0,
  unique (unit_id, sort_order)
);

create index if not exists coreen_items_unit_idx on coreen_items (unit_id, sort_order);

-- Une ligne seulement une fois qu'un mot a été pratiqué au moins une fois ;
-- absence de ligne = mot encore jamais vu. box va de 1 (tout juste revu, vu
-- récemment ou raté) à 6 (maîtrisé, intervalle de révision long).
create table if not exists coreen_progress (
  item_id uuid primary key references coreen_items(id) on delete cascade,
  box int not null default 1,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  next_review_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists coreen_stats (
  id boolean primary key default true check (id),
  xp int not null default 0,
  streak_days int not null default 0,
  last_practice_date date,
  updated_at timestamptz not null default now()
);

insert into coreen_stats (id) values (true) on conflict (id) do nothing;

alter table coreen_units enable row level security;
alter table coreen_items enable row level security;
alter table coreen_progress enable row level security;
alter table coreen_stats enable row level security;

-- Contrairement au reste du site (récits, réactions...), rien ici n'est
-- destiné à être vu par les cercles : c'est l'espace d'apprentissage
-- personnel de Léona, donc tout est réservé au compte Moi, en lecture
-- comme en écriture.
create policy "coréen réservé à Moi (unités)" on coreen_units
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (items)" on coreen_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (progression)" on coreen_progress
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (stats)" on coreen_stats
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Contenu de départ (~97 mots/phrases sur 9 unités, du Hangul aux
-- expressions utiles en PVT). Facile à enrichir ensuite depuis l'onglet
-- Coréen lui-même ("+ Ajouter un mot"), ou en ajoutant des lignes ici.
-- ---------------------------------------------------------------------------
insert into coreen_units (id, title, icon, sort_order) values
  ('hangul-voyelles', 'Hangul — Voyelles', '🔤', 1),
  ('hangul-consonnes', 'Hangul — Consonnes', '🔡', 2),
  ('salutations', 'Salutations & politesse', '👋', 3),
  ('nombres-sino', 'Nombres (sino-coréens)', '🔢', 4),
  ('nombres-natifs', 'Nombres (natifs)', '🔟', 5),
  ('nourriture', 'Nourriture & restaurant', '🍚', 6),
  ('transport-ville', 'Transport & ville', '🚇', 7),
  ('quotidien-pvt', 'Expressions utiles au quotidien', '💬', 8),
  ('temps-dates', 'Temps & jours de la semaine', '📅', 9)
on conflict (id) do nothing;

insert into coreen_items (unit_id, korean, romanization, french, note, sort_order) values
  ('hangul-voyelles', 'ㅏ', 'a', '"a" (comme dans "papa")', null, 1),
  ('hangul-voyelles', 'ㅑ', 'ya', '"ya"', null, 2),
  ('hangul-voyelles', 'ㅓ', 'eo', '"eo" (un "o" ouvert)', null, 3),
  ('hangul-voyelles', 'ㅕ', 'yeo', '"yeo"', null, 4),
  ('hangul-voyelles', 'ㅗ', 'o', '"o"', null, 5),
  ('hangul-voyelles', 'ㅛ', 'yo', '"yo"', null, 6),
  ('hangul-voyelles', 'ㅜ', 'u', '"ou"', null, 7),
  ('hangul-voyelles', 'ㅠ', 'yu', '"you"', null, 8),
  ('hangul-voyelles', 'ㅡ', 'eu', '"eu" (bref, lèvres tirées)', null, 9),
  ('hangul-voyelles', 'ㅣ', 'i', '"i"', null, 10),

  ('hangul-consonnes', 'ㄱ', 'g/k', '"g" ou "k" selon la position', null, 1),
  ('hangul-consonnes', 'ㄴ', 'n', '"n"', null, 2),
  ('hangul-consonnes', 'ㄷ', 'd/t', '"d" ou "t" selon la position', null, 3),
  ('hangul-consonnes', 'ㄹ', 'r/l', '"r" ou "l" selon la position', null, 4),
  ('hangul-consonnes', 'ㅁ', 'm', '"m"', null, 5),
  ('hangul-consonnes', 'ㅂ', 'b/p', '"b" ou "p" selon la position', null, 6),
  ('hangul-consonnes', 'ㅅ', 's', '"s"', null, 7),
  ('hangul-consonnes', 'ㅇ', 'ng', 'muette en début de syllabe, "ng" en fin', null, 8),
  ('hangul-consonnes', 'ㅈ', 'j', '"j"', null, 9),
  ('hangul-consonnes', 'ㅊ', 'ch', '"ch" (aspiré)', null, 10),
  ('hangul-consonnes', 'ㅋ', 'k', '"k" (aspiré)', null, 11),
  ('hangul-consonnes', 'ㅌ', 't', '"t" (aspiré)', null, 12),
  ('hangul-consonnes', 'ㅍ', 'p', '"p" (aspiré)', null, 13),
  ('hangul-consonnes', 'ㅎ', 'h', '"h"', null, 14),

  ('salutations', '안녕하세요', 'annyeonghaseyo', 'Bonjour', 'poli, standard', 1),
  ('salutations', '안녕히 가세요', 'annyeonghi gaseyo', 'Au revoir (à qui part)', 'dit par la personne qui reste', 2),
  ('salutations', '안녕히 계세요', 'annyeonghi gyeseyo', 'Au revoir (à qui reste)', 'dit par la personne qui part', 3),
  ('salutations', '감사합니다', 'gamsahamnida', 'Merci', 'très formel', 4),
  ('salutations', '고맙습니다', 'gomapseumnida', 'Merci', null, 5),
  ('salutations', '죄송합니다', 'joesonghamnida', 'Je suis désolé(e)', 'formel', 6),
  ('salutations', '미안해요', 'mianhaeyo', 'Désolé(e)', null, 7),
  ('salutations', '네', 'ne', 'Oui', null, 8),
  ('salutations', '아니요', 'aniyo', 'Non', null, 9),
  ('salutations', '저기요', 'jeogiyo', 'Excusez-moi', 'pour interpeller quelqu''un', 10),
  ('salutations', '이름이 뭐예요', 'ireumi mwoyeyo', 'Comment tu t''appelles ?', null, 11),
  ('salutations', '만나서 반가워요', 'mannaseo bangawoyo', 'Ravi(e) de te rencontrer', null, 12),

  ('nombres-sino', '일', 'il', '1', 'dates, argent, numéros', 1),
  ('nombres-sino', '이', 'i', '2', null, 2),
  ('nombres-sino', '삼', 'sam', '3', null, 3),
  ('nombres-sino', '사', 'sa', '4', null, 4),
  ('nombres-sino', '오', 'o', '5', null, 5),
  ('nombres-sino', '육', 'yuk', '6', null, 6),
  ('nombres-sino', '칠', 'chil', '7', null, 7),
  ('nombres-sino', '팔', 'pal', '8', null, 8),
  ('nombres-sino', '구', 'gu', '9', null, 9),
  ('nombres-sino', '십', 'sip', '10', null, 10),

  ('nombres-natifs', '하나', 'hana', '1', 'objets, âge, heures', 1),
  ('nombres-natifs', '둘', 'dul', '2', null, 2),
  ('nombres-natifs', '셋', 'set', '3', null, 3),
  ('nombres-natifs', '넷', 'net', '4', null, 4),
  ('nombres-natifs', '다섯', 'daseot', '5', null, 5),
  ('nombres-natifs', '여섯', 'yeoseot', '6', null, 6),
  ('nombres-natifs', '일곱', 'ilgop', '7', null, 7),
  ('nombres-natifs', '여덟', 'yeodeol', '8', null, 8),
  ('nombres-natifs', '아홉', 'ahop', '9', null, 9),
  ('nombres-natifs', '열', 'yeol', '10', null, 10),

  ('nourriture', '밥', 'bap', 'Riz / repas', null, 1),
  ('nourriture', '물', 'mul', 'Eau', null, 2),
  ('nourriture', '김치', 'gimchi', 'Kimchi', null, 3),
  ('nourriture', '고기', 'gogi', 'Viande', null, 4),
  ('nourriture', '커피', 'keopi', 'Café', null, 5),
  ('nourriture', '맛있어요', 'masisseoyo', 'C''est délicieux', null, 6),
  ('nourriture', '배고파요', 'baegopayo', 'J''ai faim', null, 7),
  ('nourriture', '계산서 주세요', 'gyesanseo juseyo', 'L''addition s''il vous plaît', null, 8),
  ('nourriture', '메뉴', 'menyu', 'Menu', null, 9),
  ('nourriture', '소주', 'soju', 'Soju', null, 10),

  ('transport-ville', '지하철', 'jihacheol', 'Métro', null, 1),
  ('transport-ville', '버스', 'beoseu', 'Bus', null, 2),
  ('transport-ville', '택시', 'taeksi', 'Taxi', null, 3),
  ('transport-ville', '편의점', 'pyeonuijeom', 'Supérette (konbini)', null, 4),
  ('transport-ville', '화장실', 'hwajangsil', 'Toilettes', null, 5),
  ('transport-ville', '어디예요', 'eodiyeyo', 'Où est-ce ?', null, 6),
  ('transport-ville', '얼마예요', 'eolmayeyo', 'Combien ça coûte ?', null, 7),
  ('transport-ville', '여기요', 'yeogiyo', 'Tenez / Par ici', 'pour appeler quelqu''un', 8),
  ('transport-ville', '오른쪽', 'oreunjjok', 'À droite', null, 9),
  ('transport-ville', '왼쪽', 'oenjjok', 'À gauche', null, 10),

  ('quotidien-pvt', '도와주세요', 'dowajuseyo', 'Aidez-moi s''il vous plaît', null, 1),
  ('quotidien-pvt', '천천히 말해 주세요', 'cheoncheonhi malhae juseyo', 'Parlez plus lentement s''il vous plaît', null, 2),
  ('quotidien-pvt', '이해 못해요', 'ihae mothaeyo', 'Je ne comprends pas', null, 3),
  ('quotidien-pvt', '한국어를 조금 해요', 'hangugeoreul jogeum haeyo', 'Je parle un peu coréen', null, 4),
  ('quotidien-pvt', '잠깐만요', 'jamkkanmanyo', 'Un instant s''il vous plaît', null, 5),
  ('quotidien-pvt', '괜찮아요', 'gwaenchanayo', 'Ça va / Pas de souci', null, 6),
  ('quotidien-pvt', '정말요', 'jeongmallyo', 'Vraiment ?', null, 7),
  ('quotidien-pvt', '화이팅', 'hwaiting', 'Bon courage !', 'emprunté à l''anglais "fighting"', 8),

  ('temps-dates', '오늘', 'oneul', 'Aujourd''hui', null, 1),
  ('temps-dates', '내일', 'naeil', 'Demain', null, 2),
  ('temps-dates', '어제', 'eoje', 'Hier', null, 3),
  ('temps-dates', '지금', 'jigeum', 'Maintenant', null, 4),
  ('temps-dates', '아침', 'achim', 'Matin', null, 5),
  ('temps-dates', '저녁', 'jeonyeok', 'Soir', null, 6),
  ('temps-dates', '월요일', 'woryoil', 'Lundi', null, 7),
  ('temps-dates', '화요일', 'hwayoil', 'Mardi', null, 8),
  ('temps-dates', '수요일', 'suyoil', 'Mercredi', null, 9),
  ('temps-dates', '목요일', 'mogyoil', 'Jeudi', null, 10),
  ('temps-dates', '금요일', 'geumyoil', 'Vendredi', null, 11),
  ('temps-dates', '토요일', 'toyoil', 'Samedi', null, 12),
  ('temps-dates', '일요일', 'iryoil', 'Dimanche', null, 13)
on conflict (unit_id, sort_order) do nothing;
