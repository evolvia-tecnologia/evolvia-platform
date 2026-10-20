type Identity = { name: string; institution: string };

export function authorIdentitySnapshot(author: Identity) {
  return { nameSnapshot: author.name, institutionSnapshot: author.institution };
}

export function readAuthorIdentity(author: {
  nameSnapshot?: string | null;
  institutionSnapshot?: string | null;
  person: { name: string; institution?: string | null };
}): Identity {
  return {
    name: author.nameSnapshot ?? author.person.name,
    // Empty string is intentional: clearing an institution must survive resume.
    institution: author.institutionSnapshot ?? author.person.institution ?? '',
  };
}
