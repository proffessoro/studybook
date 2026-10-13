import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { PRIVACY_POLICY_VERSION } from '@studybook/shared';

/**
 * Privacy policy (NFR-07). Users accept this version at sign-up; bump
 * PRIVACY_POLICY_VERSION in packages/shared whenever the text changes.
 * DRAFT: to be reviewed against Cameroon's personal data protection law before release.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${locale === 'en' ? 'Privacy policy' : 'Politique de confidentialité'} · Studybook` };
}

export default async function PrivacyPage() {
  const locale = await getLocale();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8 leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">
      {locale === 'en' ? <PolicyEn /> : <PolicyFr />}
    </main>
  );
}

function PolicyFr() {
  return (
    <>
      <h1 className="text-2xl font-bold">Politique de confidentialité</h1>
      <p className="text-sm text-muted-foreground">Version du {PRIVACY_POLICY_VERSION}</p>
      <p>
        Ce serveur Studybook est géré par son exploitant (l&apos;organisation qui l&apos;héberge). Cette page explique
        quelles données nous collectons, pourquoi, et quels sont vos droits.
      </p>

      <h2>Données collectées</h2>
      <ul>
        <li>Votre nom complet, votre pseudo, votre adresse email, votre numéro de téléphone et votre langue.</li>
        <li>Votre mot de passe, enregistré uniquement sous forme chiffrée (hachée) : personne ne peut le lire.</li>
        <li>Ce que vous publiez ou envoyez dans vos groupes : messages, preuves, réponses aux quiz.</li>
        <li>
          Votre adresse IP, gardée au plus 24 heures, uniquement pour limiter les abus (par exemple les envois
          d&apos;emails répétés).
        </li>
      </ul>

      <h2>Utilisation</h2>
      <ul>
        <li>Créer et sécuriser votre compte, et vérifier votre adresse email.</li>
        <li>Faire fonctionner vos groupes : contenus, tâches, suivi de progression.</li>
        <li>
          Nous n&apos;envoyons des emails que pour vérifier votre adresse et récupérer votre compte. Nous ne vendons pas
          vos données et n&apos;affichons pas de publicité.
        </li>
      </ul>

      <h2>Qui voit quoi</h2>
      <ul>
        <li>Les autres membres d&apos;un groupe voient seulement votre pseudo et votre photo.</li>
        <li>
          Le responsable d&apos;un groupe voit aussi votre nom, votre email, votre téléphone, vos preuves et votre
          progression dans ce groupe.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Nous utilisons seulement les cookies nécessaires : votre choix de langue et, une fois connecté, votre session.
        Aucun cookie publicitaire ni de suivi.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez consulter et corriger vos informations dans votre profil, télécharger vos données et supprimer
        votre compte. Pour toute question, contactez l&apos;exploitant de ce serveur.
      </p>
    </>
  );
}

function PolicyEn() {
  return (
    <>
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-sm text-muted-foreground">Version of {PRIVACY_POLICY_VERSION}</p>
      <p>
        This Studybook server is run by its operator (the organisation that hosts it). This page explains what data we
        collect, why, and what your rights are.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your full name, pseudo, email address, phone number, and language.</li>
        <li>Your password, stored only in hashed form: nobody can read it.</li>
        <li>What you post or submit in your groups: messages, proof, quiz answers.</li>
        <li>Your IP address, kept for at most 24 hours, only to limit abuse (for example repeated emails).</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To create and secure your account, and to verify your email address.</li>
        <li>To run your groups: content, tasks, and progress tracking.</li>
        <li>
          We only send emails to verify your address and to recover your account. We don&apos;t sell your data or show
          ads.
        </li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>Other members of a group see only your pseudo and photo.</li>
        <li>A group&apos;s leader also sees your name, email, phone, proof, and progress in that group.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We only use necessary cookies: your language choice and, once you log in, your session. No advertising or
        tracking cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        You can view and correct your information in your profile, download your data, and delete your account. For any
        question, contact the operator of this server.
      </p>
    </>
  );
}
