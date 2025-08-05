export const handler = async (event: any) => {
    console.log('Event: ', event);
    
    const responsed = {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Lambda!',
            event: event,
        }),
    };
    
    return response;
};
