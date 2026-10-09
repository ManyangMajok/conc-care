CREATE TABLE users (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role VARCHAR(40) NOT NULL CHECK(role IN ('admin','office')),
 active BIGINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE sessions (
 token_hash VARCHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL,
 csrf VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL
,
FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- statement
CREATE TABLE contacts (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, company TEXT NOT NULL DEFAULT (''),
 email VARCHAR(254) NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT (''), source VARCHAR(40) NOT NULL DEFAULT 'other',
 background TEXT NOT NULL DEFAULT (''), permission VARCHAR(40) NOT NULL DEFAULT 'unknown' CHECK(permission IN ('unknown','subscribed','unsubscribed')),
 evidence TEXT NOT NULL DEFAULT (''), version BIGINT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX contacts_email ON contacts(email);
-- statement
CREATE INDEX contacts_audience ON contacts(permission, source, email);
-- statement
CREATE TABLE tags (id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE contact_tags (contact_id BIGINT, tag_id BIGINT, PRIMARY KEY(contact_id,tag_id),
FOREIGN KEY (contact_id) REFERENCES contacts(id),
FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE sites (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, contact_id BIGINT NOT NULL,
 address TEXT NOT NULL, access_notes TEXT NOT NULL DEFAULT (''), version BIGINT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,contact_id)
,
FOREIGN KEY (contact_id) REFERENCES contacts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX sites_contact ON sites(contact_id);
-- statement
CREATE TABLE leads (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, email VARCHAR(254) NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT (''),
 address TEXT NOT NULL DEFAULT (''), service TEXT NOT NULL DEFAULT ('other'), source VARCHAR(40) NOT NULL DEFAULT 'other',
 details TEXT NOT NULL DEFAULT (''), stage VARCHAR(40) NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','qualified','quoted','won','lost')),
 contact_id BIGINT, site_id BIGINT, followup VARCHAR(10) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(site_id,contact_id) REFERENCES sites(id,contact_id), CHECK(site_id IS NULL OR contact_id IS NOT NULL)
,
FOREIGN KEY (contact_id) REFERENCES contacts(id),
FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX leads_stage ON leads(stage,id);
-- statement
CREATE INDEX leads_followup ON leads(followup,stage);
-- statement
CREATE INDEX leads_contact ON leads(contact_id);
-- statement
CREATE INDEX leads_site ON leads(site_id);
-- statement
CREATE TABLE quotes (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, contact_id BIGINT NOT NULL,
 site_id BIGINT, lead_id BIGINT,
 amount_cents BIGINT CHECK(amount_cents >= 0), scope TEXT NOT NULL DEFAULT (''), exclusions TEXT NOT NULL DEFAULT (''), valid_until VARCHAR(10) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','declined')), revision BIGINT NOT NULL DEFAULT 1,
 version BIGINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(site_id,contact_id) REFERENCES sites(id,contact_id)
,
FOREIGN KEY (contact_id) REFERENCES contacts(id),
FOREIGN KEY (site_id) REFERENCES sites(id),
FOREIGN KEY (lead_id) REFERENCES leads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX quotes_lead ON quotes(lead_id,status);
-- statement
CREATE INDEX quotes_contact ON quotes(contact_id);
-- statement
CREATE INDEX quotes_site ON quotes(site_id);
-- statement
CREATE TABLE quote_snapshots (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, quote_id BIGINT NOT NULL, revision BIGINT NOT NULL,
 snapshot LONGTEXT NOT NULL, actor TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(quote_id,revision)
,
FOREIGN KEY (quote_id) REFERENCES quotes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE consent_history (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, contact_id BIGINT NOT NULL, email VARCHAR(254) NOT NULL,
 permission VARCHAR(40) NOT NULL, evidence TEXT NOT NULL, actor TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
,
FOREIGN KEY (contact_id) REFERENCES contacts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX consent_contact ON consent_history(contact_id,id);
-- statement
CREATE TABLE suppressions (email VARCHAR(254) PRIMARY KEY, active BIGINT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE segments (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(240) NOT NULL, tag VARCHAR(60) NOT NULL DEFAULT '', source VARCHAR(40) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE activity (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, entity VARCHAR(40) NOT NULL, entity_id BIGINT NOT NULL, actor TEXT NOT NULL,
 message TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX activity_entity ON activity(entity,entity_id,id);
-- statement
CREATE TABLE rate_limits (`key` VARCHAR(64) PRIMARY KEY, hits BIGINT NOT NULL, expires_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE mail_outbox (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, lead_id BIGINT NOT NULL, recipient VARCHAR(254) NOT NULL, subject TEXT NOT NULL,
 body TEXT NOT NULL, status VARCHAR(40) NOT NULL CHECK(status IN ('disabled','pending','sending','sent','failed')),
 error TEXT NOT NULL DEFAULT (''), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
,
FOREIGN KEY (lead_id) REFERENCES leads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE TABLE invoices (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(240) NOT NULL,
 contact_id BIGINT NOT NULL,
 site_id BIGINT,
 quote_id BIGINT UNIQUE,
 quote_revision BIGINT,
 source_snapshot LONGTEXT,
 amount_cents BIGINT CHECK(amount_cents >= 0 AND amount_cents <= 9999999999),
 scope TEXT NOT NULL DEFAULT (''),
 exclusions TEXT NOT NULL DEFAULT (''),
 due_date VARCHAR(10) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','paid','void')),
 issued_snapshot LONGTEXT,
 version BIGINT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
,
FOREIGN KEY (contact_id) REFERENCES contacts(id),
FOREIGN KEY (site_id) REFERENCES sites(id),
FOREIGN KEY (quote_id) REFERENCES quotes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- statement
CREATE INDEX invoices_contact ON invoices(contact_id);
-- statement
CREATE TRIGGER immutable_quote_snapshots_update BEFORE UPDATE ON quote_snapshots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_quote_snapshots_delete BEFORE DELETE ON quote_snapshots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_consent_history_update BEFORE UPDATE ON consent_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_consent_history_delete BEFORE DELETE ON consent_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_activity_update BEFORE UPDATE ON activity FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_activity_delete BEFORE DELETE ON activity FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are immutable';
-- statement
CREATE TRIGGER immutable_invoice_snapshot BEFORE UPDATE ON invoices FOR EACH ROW BEGIN IF OLD.issued_snapshot IS NOT NULL AND NOT (NEW.issued_snapshot <=> OLD.issued_snapshot) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Issued invoice snapshot is immutable'; END IF; END;
-- statement
CREATE TABLE crm_write_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
-- statement
INSERT INTO crm_write_lock VALUES (1);
