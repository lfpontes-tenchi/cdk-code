export const handler = async (event: any) => {
    console.log('Event: ', event);
    
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Lambda!',
            event: event,
        }),
    };
    
    return response;
};
