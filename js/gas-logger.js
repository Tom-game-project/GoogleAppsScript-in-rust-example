// gas::logger@0.1.0-alpha
//
//
export const log = function (data)
{
	Logger.log(data);
}

export const clear = function ()
{
	Logger.clear();
}

export const getLog = function ()
{
	return Logger.getLog();
}
