Solo deberá atriburise el resuletado si el  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
