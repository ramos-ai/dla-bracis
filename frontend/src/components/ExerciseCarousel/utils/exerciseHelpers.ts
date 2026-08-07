import type { SubmissionProps } from '../../../services/ExercisesService';
import type { AnswerItem } from '../types';

export function isSubmissionFinalized(submission: SubmissionProps | null | undefined): boolean {
  if (!submission) return false;
  return submission.isFinalized === true || 
         (submission.finalizedAt !== null && submission.finalizedAt !== undefined && submission.finalizedAt !== '');
}

export function resetLabelInputs(): void {
  const radios = document.querySelectorAll('.exercise-carousel__label-item input[type="radio"]');
  radios.forEach((r) => {
    (r as HTMLInputElement).checked = false;
  });
}

export function updateAnswerInList(
  answers: AnswerItem[],
  newAnswer: AnswerItem
): AnswerItem[] {
  const filtered = answers.filter(a => a.mediaId !== newAnswer.mediaId);
  return [...filtered, newAnswer];
}

export function isValidMediaId(mediaId: string | undefined): boolean {
  return Boolean(mediaId && mediaId.trim() !== '');
}

export function filterValidAnswers(answers: AnswerItem[]): AnswerItem[] {
  return answers.filter(answer => isValidMediaId(answer.mediaId));
}

export function findLastAnsweredIndex(
  mediaIds: string[],
  answers: AnswerItem[] | undefined
): number {
  if (!answers || answers.length === 0) return -1;
  
  const lastAnsweredIndex = mediaIds.findIndex(id => 
    answers.some(a => a.mediaId === id)
  );
  
  return lastAnsweredIndex;
}
