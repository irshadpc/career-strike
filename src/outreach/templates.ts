export type OutreachKind =
  | 'status_inquiry'
  | 'post_interview_thanks'
  | 'offer_next_steps'
  | 'referral_request'
  | 'recruiter_response'
  | 'offer_correspondence';

export interface OutreachTemplate {
  subject: string;
  body: string;
}

/** Builds a professional, concise, respectful outreach email draft based on real application facts. */
export function buildOutreachDraft(params: {
  kind: OutreachKind;
  employer: string;
  title: string;
  candidateName?: string;
  contactName?: string;
  interviewStage?: string;
  discussionHighlight?: string;
  referralRole?: string;
}): OutreachTemplate {
  const {
    kind,
    employer,
    title,
    candidateName = 'Candidate',
    contactName = '',
    interviewStage = 'our recent interview',
    discussionHighlight = '',
    referralRole = title,
  } = params;

  const greeting = contactName.trim() ? `Dear ${contactName.trim()},` : `Hello ${employer} Team,`;

  if (kind === 'referral_request') {
    return {
      subject: `Connecting regarding ${referralRole} at ${employer} — ${candidateName}`,
      body: `${greeting}

I hope you are doing well!

I noticed an open ${referralRole} role on the ${employer} team and immediately thought of you given your experience there.

My background focuses on high-impact systems engineering and product architecture. Given your insight into the culture and engineering focus at ${employer}, would you be open to sharing a brief perspective on the team, or if you feel comfortable, passing along an internal referral?

Either way, thank you for your time and continued support!

Best regards,
${candidateName}`,
    };
  }

  if (kind === 'recruiter_response') {
    return {
      subject: `Re: ${title} opportunity at ${employer} — ${candidateName}`,
      body: `${greeting}

Thank you for reaching out regarding the ${title} role at ${employer}.

The team's trajectory and focus areas are very aligned with my background in distributed systems and platform reliability. I would be delighted to connect for an introductory conversation to learn more about the team's upcoming goals and how I could contribute.

I am generally available this week during afternoon hours. Please let me know a couple of times that suit your calendar.

Warm regards,
${candidateName}`,
    };
  }

  if (kind === 'offer_correspondence') {
    return {
      subject: `Offer Discussion & Clarification: ${title} — ${candidateName}`,
      body: `${greeting}

Thank you again for extending the offer to join ${employer} as ${title}. I am thrilled about the opportunity to partner with the team.

Having reviewed the package and verified current market standards for this scope, I would like to discuss whether there is flexibility on the base salary component to better reflect the seniority and responsibilities of the role.

Could we schedule a quick call to discuss the compensation structure and start date options? I am eager to reach an agreement that sets us up for long-term success.

Best regards,
${candidateName}`,
    };
  }

  if (kind === 'status_inquiry') {
    return {
      subject: `Following up on my application: ${title} — ${candidateName}`,
      body: `${greeting}

I hope you are having a productive week.

I am writing to respectfully check in on the status of my application for the ${title} position at ${employer}.

Having reviewed the team's engineering mission and objectives, I remain very excited about the opportunity to contribute my experience in building reliable, high-performance systems to your team.

Please let me know if there are any additional details, portfolio links, or work samples I can provide to assist in your review. Thank you for your time and consideration.

Best regards,
${candidateName}`,
    };
  }

  if (kind === 'post_interview_thanks') {
    const highlightSentence = discussionHighlight.trim()
      ? `\nI especially enjoyed our discussion regarding ${discussionHighlight.trim()}. It reaffirmed my enthusiasm for how the team approaches engineering craft and problem solving.\n`
      : '';

    return {
      subject: `Thank you — ${interviewStage} for ${title}`,
      body: `${greeting}

Thank you for taking the time to speak with me today regarding the ${title} role at ${employer}.
${highlightSentence}
I am confident that my background aligns closely with the team's goals, and I would love the opportunity to contribute directly to ${employer}'s upcoming milestones.

Please let me know if there is any other information I can share as you proceed with the next steps. I look forward to hearing from you.

Warm regards,
${candidateName}`,
    };
  }

  // offer_next_steps
  return {
    subject: `Offer Discussion: ${title} — ${candidateName}`,
    body: `${greeting}

Thank you very much for extending the offer to join ${employer} as ${title}. I am genuinely excited about the team, the vision, and the work ahead.

I am currently reviewing the details of the compensation and benefits package. Could we schedule a brief 15-minute call this week to clarify a few details regarding team start dates and scope?

Thank you once again for your support throughout this interview process.

Best regards,
${candidateName}`,
  };
}
