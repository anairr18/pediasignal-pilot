CREATE TABLE IF NOT EXISTS "pubmed_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"pmid" text NOT NULL,
	"title" text NOT NULL,
	"abstract" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"journal" text,
	"pub_date" text,
	"doi" text,
	"query" text NOT NULL,
	"search_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relevance_score" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"last_accessed" timestamp DEFAULT now(),
	CONSTRAINT "pubmed_articles_pmid_unique" UNIQUE("pmid")
);
