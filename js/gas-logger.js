// gas:logger@0.1.0-alpha

export function log(data) {
	Logger.log(data);
};

export function clear() {
	Logger.clear();
};

export function getLog() {
	return Logger.getLog();
};
