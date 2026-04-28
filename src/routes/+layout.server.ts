import type { LayoutServerLoad } from './$types';
import { configService } from '$lib/server/services/config';

export const load: LayoutServerLoad = async () => {
	const config = await configService.get();
	return {
		conventionName: config.conventionName,
		weightUnit: config.weightUnit
	};
};
