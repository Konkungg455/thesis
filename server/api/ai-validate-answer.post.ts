import { validateScreeningAnswer } from '../utils/aiValidateScreeningAnswer';

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const body = await readBody(event).catch(() => ({}));

    const symptom = String(body?.symptom ?? body?.category ?? '').trim();
    const questionNum = Number(body?.questionNum ?? 0);
    const questionText = String(body?.questionText ?? '').trim();
    const userAnswer = String(body?.userAnswer ?? '').trim();
    const locale = String(body?.locale ?? 'th').trim();

    if (!symptom || questionNum <= 0 || !questionText || !userAnswer) {
        throw createError({
            statusCode: 400,
            statusMessage: 'symptom, questionNum, questionText, userAnswer are required',
        });
    }

    const result = await validateScreeningAnswer(config, {
        symptom,
        questionNum,
        questionText,
        userAnswer,
        locale,
    });

    return {
        status: 'success',
        ...result,
    };
});
