-- Database schema for Quant Backend
-- Run this SQL in your Neon database console

-- Create members table with proper constraints
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  member_id INTEGER,
  nickname VARCHAR(255),
  tier VARCHAR(50),
  active BOOLEAN DEFAULT false,
  renewal_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create verifications table with auto-incrementing ID
CREATE TABLE IF NOT EXISTS verifications (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create member_installs table (logs all installs, no duplicate checking)
CREATE TABLE IF NOT EXISTS member_installs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  install_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_member_id ON members(member_id);
CREATE INDEX IF NOT EXISTS idx_verifications_email ON verifications(email);
CREATE INDEX IF NOT EXISTS idx_verifications_created_at ON verifications(created_at);
CREATE INDEX IF NOT EXISTS idx_member_installs_email ON member_installs(email);
CREATE INDEX IF NOT EXISTS idx_member_installs_install_id ON member_installs(install_id);
